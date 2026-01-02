//! CSV processing logic
//!
//! Handles CSV parsing, type inference, and data transformation.

use std::collections::HashSet;
use std::path::Path;

use regex::Regex;

use crate::csv::types::{CsvData, CsvError, CsvRow, DataType, FormatHint};

// ============================================================================
// Constants for Type Inference
// ============================================================================

/// Maximum number of values to sample for type inference
const TYPE_INFERENCE_SAMPLE_SIZE: usize = 100;

/// Maximum number of unique values for enum detection
const ENUM_MAX_CARDINALITY: usize = 20;

/// Minimum percentage of values that must match a pattern for type detection
const TYPE_MATCH_THRESHOLD: f64 = 0.9;

/// Read a CSV file from disk and parse it.
///
/// # Arguments
/// * `path` - Path to the CSV file
/// * `max_rows` - Maximum number of data rows to return (None for unlimited)
///
/// # Returns
/// * `CsvData` with headers, rows, total_rows count, and truncated flag
pub async fn read_csv(path: &Path, max_rows: Option<usize>) -> Result<CsvData, CsvError> {
    let content = tokio::fs::read_to_string(path).await.map_err(|e| {
        CsvError::ReadError {
            message: format!("Failed to read file '{}': {}", path.display(), e),
        }
    })?;

    parse_csv_content(&content, max_rows)
}

/// Parse CSV content from a string.
///
/// # Arguments
/// * `content` - CSV content as a string
/// * `max_rows` - Maximum number of data rows to return (None for unlimited)
///
/// # Returns
/// * `CsvData` with headers, rows, total_rows count, and truncated flag
///
/// # Behavior
/// - Handles variable column counts (flexible parsing)
/// - Skips malformed rows with a warning (does not crash)
/// - Tracks total rows even when truncated
pub fn parse_csv_content(content: &str, max_rows: Option<usize>) -> Result<CsvData, CsvError> {
    let mut reader = csv::ReaderBuilder::new()
        .flexible(true) // Allow variable column counts
        .has_headers(true)
        .trim(csv::Trim::All) // Trim whitespace from fields
        .from_reader(content.as_bytes());

    // Extract headers
    let headers: Vec<String> = reader
        .headers()
        .map_err(|e| CsvError::ParseError {
            message: format!("Failed to parse CSV headers: {}", e),
        })?
        .iter()
        .map(|s| s.to_string())
        .collect();

    if headers.is_empty() {
        return Err(CsvError::ParseError {
            message: "CSV file has no headers".to_string(),
        });
    }

    let header_count = headers.len();
    let mut rows: Vec<CsvRow> = Vec::new();
    let mut total_rows: usize = 0;
    let mut skipped_rows: usize = 0;

    // Determine the effective row limit
    let row_limit = max_rows.unwrap_or(usize::MAX);

    for (line_number, result) in reader.records().enumerate() {
        match result {
            Ok(record) => {
                total_rows += 1;

                // Only collect rows up to the limit
                if rows.len() < row_limit {
                    // Normalize row to match header count
                    let row: CsvRow = normalize_row(&record, header_count);
                    rows.push(row);
                }
            }
            Err(e) => {
                // Skip malformed rows with a warning
                skipped_rows += 1;
                tracing::warn!(
                    "Skipping malformed row {} in CSV: {}",
                    line_number + 2, // +2 for 1-based indexing and header row
                    e
                );
            }
        }
    }

    if skipped_rows > 0 {
        tracing::info!(
            "CSV parsing complete: {} rows parsed, {} rows skipped due to errors",
            total_rows,
            skipped_rows
        );
    }

    let truncated = total_rows > rows.len();

    Ok(CsvData {
        headers,
        rows,
        total_rows,
        truncated,
    })
}

/// Normalize a CSV record to match the expected column count.
///
/// - If the record has fewer columns than headers, pad with empty strings
/// - If the record has more columns than headers, truncate
fn normalize_row(record: &csv::StringRecord, header_count: usize) -> CsvRow {
    let mut row: CsvRow = record.iter().map(|s| s.to_string()).collect();

    // Pad with empty strings if needed
    while row.len() < header_count {
        row.push(String::new());
    }

    // Truncate if too many columns
    row.truncate(header_count);

    row
}

// ============================================================================
// Type Inference
// ============================================================================

/// Infer the data type from a collection of string values.
///
/// Uses pattern matching to detect common data types in order of specificity.
/// For large datasets, samples a subset of values for efficiency.
///
/// # Arguments
/// * `values` - Slice of string values from a column
///
/// # Returns
/// * `DataType` - The inferred data type with any associated metadata
///
/// # Detection Order
/// 1. Boolean (true/false, yes/no, 1/0, on/off)
/// 2. Percentage (numeric values ending with %)
/// 3. Currency ($, EUR, GBP, USD prefix with numeric)
/// 4. Date (YYYY-MM-DD, MM/DD/YYYY, DD/MM/YYYY)
/// 5. DateTime (Date + time component)
/// 6. Integer (whole numbers, optional comma grouping)
/// 7. Decimal (floating point numbers)
/// 8. Enum (low cardinality <= 20 unique values)
/// 9. Text (fallback)
pub fn infer_data_type(values: &[String]) -> DataType {
    // Filter out empty values for analysis
    let non_empty: Vec<&str> = values
        .iter()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .collect();

    // If all values are empty, default to Text
    if non_empty.is_empty() {
        return DataType::Text;
    }

    // Sample values for large datasets
    let sample = sample_values(&non_empty);

    // Try each type detector in order of specificity
    if let Some(data_type) = try_detect_boolean(&sample) {
        return data_type;
    }

    if let Some(data_type) = try_detect_percentage(&sample) {
        return data_type;
    }

    if let Some(data_type) = try_detect_currency(&sample) {
        return data_type;
    }

    if let Some(data_type) = try_detect_datetime(&sample) {
        return data_type;
    }

    if let Some(data_type) = try_detect_date(&sample) {
        return data_type;
    }

    if let Some(data_type) = try_detect_integer(&sample) {
        return data_type;
    }

    if let Some(data_type) = try_detect_decimal(&sample) {
        return data_type;
    }

    // Check for enum (low cardinality) - use all non-empty values for accuracy
    if let Some(data_type) = try_detect_enum(&non_empty) {
        return data_type;
    }

    // Fallback to Text
    DataType::Text
}

/// Sample values from a large dataset for efficient type inference.
///
/// For datasets larger than TYPE_INFERENCE_SAMPLE_SIZE, takes an evenly
/// distributed sample across the dataset.
fn sample_values<'a>(values: &[&'a str]) -> Vec<&'a str> {
    if values.len() <= TYPE_INFERENCE_SAMPLE_SIZE {
        return values.to_vec();
    }

    let step = values.len() / TYPE_INFERENCE_SAMPLE_SIZE;
    values
        .iter()
        .step_by(step)
        .take(TYPE_INFERENCE_SAMPLE_SIZE)
        .copied()
        .collect()
}

/// Check if a sufficient percentage of values match a pattern.
fn meets_threshold(matches: usize, total: usize) -> bool {
    if total == 0 {
        return false;
    }
    (matches as f64 / total as f64) >= TYPE_MATCH_THRESHOLD
}

// ============================================================================
// Pattern Detectors
// ============================================================================

/// Detect boolean values (true/false, yes/no, 1/0, on/off, t/f, y/n)
fn try_detect_boolean(values: &[&str]) -> Option<DataType> {
    let boolean_patterns: HashSet<&str> = [
        "true", "false", "yes", "no", "1", "0", "on", "off", "t", "f", "y", "n",
    ]
    .into_iter()
    .collect();

    let matches = values
        .iter()
        .filter(|v| boolean_patterns.contains(v.to_lowercase().as_str()))
        .count();

    if meets_threshold(matches, values.len()) {
        Some(DataType::Boolean)
    } else {
        None
    }
}

/// Detect percentage values (numeric with % suffix)
fn try_detect_percentage(values: &[&str]) -> Option<DataType> {
    let percentage_regex = Regex::new(r"^-?\d+(?:,\d{3})*(?:\.\d+)?%$").unwrap();

    let matches = values
        .iter()
        .filter(|v| percentage_regex.is_match(v))
        .count();

    if meets_threshold(matches, values.len()) {
        Some(DataType::Percentage)
    } else {
        None
    }
}

/// Detect currency values and identify the currency code.
///
/// Supports:
/// - $ prefix (USD)
/// - EUR prefix or suffix
/// - GBP or pound sign prefix
/// - USD prefix
fn try_detect_currency(values: &[&str]) -> Option<DataType> {
    // Currency patterns with their associated codes
    let patterns = [
        (r"^\$-?\d+(?:,\d{3})*(?:\.\d+)?$", "USD"),
        (r"^-?\$\d+(?:,\d{3})*(?:\.\d+)?$", "USD"),
        (r"^USD\s*-?\d+(?:,\d{3})*(?:\.\d+)?$", "USD"),
        (r"^-?\d+(?:,\d{3})*(?:\.\d+)?\s*USD$", "USD"),
        (r"^EUR\s*-?\d+(?:,\d{3})*(?:\.\d+)?$", "EUR"),
        (r"^-?\d+(?:,\d{3})*(?:\.\d+)?\s*EUR$", "EUR"),
        (r"^\u{20AC}-?\d+(?:,\d{3})*(?:\.\d+)?$", "EUR"), // Euro sign
        (r"^GBP\s*-?\d+(?:,\d{3})*(?:\.\d+)?$", "GBP"),
        (r"^-?\d+(?:,\d{3})*(?:\.\d+)?\s*GBP$", "GBP"),
        (r"^\u{00A3}-?\d+(?:,\d{3})*(?:\.\d+)?$", "GBP"), // Pound sign
    ];

    for (pattern, code) in patterns {
        let regex = Regex::new(pattern).unwrap();
        let matches = values.iter().filter(|v| regex.is_match(v)).count();

        if meets_threshold(matches, values.len()) {
            return Some(DataType::Currency {
                code: code.to_string(),
            });
        }
    }

    None
}

/// Detect date values and identify the format.
///
/// Supports:
/// - YYYY-MM-DD (ISO 8601)
/// - MM/DD/YYYY (US format)
/// - DD/MM/YYYY (European format)
/// - YYYY/MM/DD
/// - DD-MM-YYYY
/// - MM-DD-YYYY
fn try_detect_date(values: &[&str]) -> Option<DataType> {
    let date_patterns = [
        (r"^\d{4}-\d{2}-\d{2}$", "YYYY-MM-DD"),
        (r"^\d{2}/\d{2}/\d{4}$", "MM/DD/YYYY"), // Could also be DD/MM/YYYY
        (r"^\d{4}/\d{2}/\d{2}$", "YYYY/MM/DD"),
        (r"^\d{2}-\d{2}-\d{4}$", "MM-DD-YYYY"), // Could also be DD-MM-YYYY
    ];

    for (pattern, format) in date_patterns {
        let regex = Regex::new(pattern).unwrap();
        let matches = values.iter().filter(|v| regex.is_match(v)).count();

        if meets_threshold(matches, values.len()) {
            // For ambiguous formats like MM/DD/YYYY vs DD/MM/YYYY,
            // try to disambiguate by checking value ranges
            let detected_format = if format == "MM/DD/YYYY" || format == "MM-DD-YYYY" {
                disambiguate_date_format(values, format)
            } else {
                format.to_string()
            };

            return Some(DataType::Date {
                format: detected_format,
            });
        }
    }

    None
}

/// Disambiguate between MM/DD/YYYY and DD/MM/YYYY formats.
///
/// Checks if first component ever exceeds 12 (must be day) or
/// if second component ever exceeds 12 (must be day).
fn disambiguate_date_format(values: &[&str], default_format: &str) -> String {
    let separator = if default_format.contains('/') {
        '/'
    } else {
        '-'
    };

    let mut first_exceeds_12 = false;
    let mut second_exceeds_12 = false;

    for value in values {
        let parts: Vec<&str> = value.split(separator).collect();
        if parts.len() >= 2 {
            if let Ok(first) = parts[0].parse::<u32>() {
                if first > 12 {
                    first_exceeds_12 = true;
                }
            }
            if let Ok(second) = parts[1].parse::<u32>() {
                if second > 12 {
                    second_exceeds_12 = true;
                }
            }
        }
    }

    if first_exceeds_12 && !second_exceeds_12 {
        // First part is day (DD/MM/YYYY)
        if separator == '/' {
            "DD/MM/YYYY".to_string()
        } else {
            "DD-MM-YYYY".to_string()
        }
    } else if second_exceeds_12 && !first_exceeds_12 {
        // Second part is day (MM/DD/YYYY)
        default_format.to_string()
    } else {
        // Can't disambiguate, use default (US format assumption)
        default_format.to_string()
    }
}

/// Detect datetime values and identify the format.
///
/// Supports common datetime formats with time components.
fn try_detect_datetime(values: &[&str]) -> Option<DataType> {
    // Order matters: more specific patterns first, T separator before space
    let datetime_patterns = [
        // ISO 8601 with T separator and optional timezone
        (
            r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$",
            "YYYY-MM-DDTHH:mm:ss",
        ),
        // Space-separated datetime (more common in databases)
        (
            r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$",
            "YYYY-MM-DD HH:mm:ss",
        ),
        (r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$", "YYYY-MM-DD HH:mm"),
        (
            r"^\d{2}/\d{2}/\d{4} \d{2}:\d{2}:\d{2}$",
            "MM/DD/YYYY HH:mm:ss",
        ),
        (r"^\d{2}/\d{2}/\d{4} \d{2}:\d{2}$", "MM/DD/YYYY HH:mm"),
    ];

    for (pattern, format) in datetime_patterns {
        let regex = Regex::new(pattern).unwrap();
        let matches = values.iter().filter(|v| regex.is_match(v)).count();

        if meets_threshold(matches, values.len()) {
            return Some(DataType::DateTime {
                format: format.to_string(),
            });
        }
    }

    None
}

/// Detect integer values (whole numbers with optional comma grouping).
fn try_detect_integer(values: &[&str]) -> Option<DataType> {
    // Integer with optional comma grouping (e.g., 1,000,000)
    let integer_regex = Regex::new(r"^-?\d+(?:,\d{3})*$").unwrap();

    let matches = values
        .iter()
        .filter(|v| integer_regex.is_match(v))
        .count();

    if meets_threshold(matches, values.len()) {
        Some(DataType::Integer)
    } else {
        None
    }
}

/// Detect decimal values and determine precision.
fn try_detect_decimal(values: &[&str]) -> Option<DataType> {
    // Decimal with optional comma grouping
    let decimal_regex = Regex::new(r"^-?\d+(?:,\d{3})*\.\d+$").unwrap();

    let matches = values
        .iter()
        .filter(|v| decimal_regex.is_match(v))
        .count();

    if meets_threshold(matches, values.len()) {
        // Determine precision from decimal places
        let precision = determine_decimal_precision(values);
        Some(DataType::Decimal { precision })
    } else {
        None
    }
}

/// Determine the maximum decimal precision from a set of values.
fn determine_decimal_precision(values: &[&str]) -> Option<u8> {
    let mut max_precision: u8 = 0;

    for value in values {
        if let Some(decimal_pos) = value.rfind('.') {
            let decimal_places = (value.len() - decimal_pos - 1) as u8;
            if decimal_places > max_precision {
                max_precision = decimal_places;
            }
        }
    }

    if max_precision > 0 {
        Some(max_precision)
    } else {
        None
    }
}

/// Detect enum values (low cardinality categorical data).
///
/// If a column has <= ENUM_MAX_CARDINALITY unique values, it's likely an enum.
fn try_detect_enum(values: &[&str]) -> Option<DataType> {
    let unique_values: HashSet<&str> = values.iter().copied().collect();

    // Only treat as enum if cardinality is low and there are multiple values
    if unique_values.len() <= ENUM_MAX_CARDINALITY && unique_values.len() > 1 {
        // Don't treat single-character values as enums (likely codes or flags)
        // unless they're clearly categorical (all same length, non-numeric)
        let all_single_char = unique_values.iter().all(|v| v.len() == 1);
        let all_numeric = unique_values
            .iter()
            .all(|v| v.chars().all(|c| c.is_ascii_digit()));

        // Skip if all values are single digits (likely codes, not enums)
        if all_single_char && all_numeric {
            return None;
        }

        let mut values_vec: Vec<String> = unique_values.iter().map(|s| s.to_string()).collect();
        values_vec.sort();

        Some(DataType::Enum { values: values_vec })
    } else {
        None
    }
}

/// Infer the data type for a column and return with format hints.
///
/// This is a convenience wrapper that returns both the DataType
/// and any applicable FormatHint for display purposes.
pub fn infer_data_type_with_hint(values: &[String]) -> (DataType, Option<FormatHint>) {
    let data_type = infer_data_type(values);

    let format_hint = match &data_type {
        DataType::Date { format } => Some(FormatHint {
            pattern: Some(format.clone()),
            locale: None,
            timezone: None,
        }),
        DataType::DateTime { format } => Some(FormatHint {
            pattern: Some(format.clone()),
            locale: None,
            timezone: None,
        }),
        DataType::Currency { code } => Some(FormatHint {
            pattern: Some(format!("{} #,##0.00", code)),
            locale: match code.as_str() {
                "USD" => Some("en-US".to_string()),
                "EUR" => Some("de-DE".to_string()),
                "GBP" => Some("en-GB".to_string()),
                _ => None,
            },
            timezone: None,
        }),
        DataType::Percentage => Some(FormatHint {
            pattern: Some("#,##0.00%".to_string()),
            locale: None,
            timezone: None,
        }),
        DataType::Decimal { precision } => {
            let decimal_places = precision.unwrap_or(2);
            let zeros = "0".repeat(decimal_places as usize);
            Some(FormatHint {
                pattern: Some(format!("#,##0.{}", zeros)),
                locale: None,
                timezone: None,
            })
        }
        DataType::Integer => Some(FormatHint {
            pattern: Some("#,##0".to_string()),
            locale: None,
            timezone: None,
        }),
        _ => None,
    };

    (data_type, format_hint)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_basic_csv() {
        let content = "name,age,city\nAlice,30,NYC\nBob,25,LA\nCharlie,35,Chicago";
        let result = parse_csv_content(content, None).unwrap();

        assert_eq!(result.headers, vec!["name", "age", "city"]);
        assert_eq!(result.rows.len(), 3);
        assert_eq!(result.total_rows, 3);
        assert!(!result.truncated);

        assert_eq!(result.rows[0], vec!["Alice", "30", "NYC"]);
        assert_eq!(result.rows[1], vec!["Bob", "25", "LA"]);
        assert_eq!(result.rows[2], vec!["Charlie", "35", "Chicago"]);
    }

    #[test]
    fn test_parse_csv_with_max_rows() {
        let content = "id,value\n1,a\n2,b\n3,c\n4,d\n5,e";
        let result = parse_csv_content(content, Some(3)).unwrap();

        assert_eq!(result.headers, vec!["id", "value"]);
        assert_eq!(result.rows.len(), 3);
        assert_eq!(result.total_rows, 5);
        assert!(result.truncated);

        assert_eq!(result.rows[0], vec!["1", "a"]);
        assert_eq!(result.rows[1], vec!["2", "b"]);
        assert_eq!(result.rows[2], vec!["3", "c"]);
    }

    #[test]
    fn test_parse_csv_variable_columns() {
        // Row 2 has fewer columns, row 3 has more columns
        let content = "a,b,c\n1,2,3\n4,5\n6,7,8,9";
        let result = parse_csv_content(content, None).unwrap();

        assert_eq!(result.headers, vec!["a", "b", "c"]);
        assert_eq!(result.rows.len(), 3);

        assert_eq!(result.rows[0], vec!["1", "2", "3"]);
        assert_eq!(result.rows[1], vec!["4", "5", ""]); // Padded with empty string
        assert_eq!(result.rows[2], vec!["6", "7", "8"]); // Truncated to 3 columns
    }

    #[test]
    fn test_parse_csv_with_quotes() {
        let content = r#"name,description
"John Doe","A person with a comma, in the description"
"Jane","Simple description""#;
        let result = parse_csv_content(content, None).unwrap();

        assert_eq!(result.headers, vec!["name", "description"]);
        assert_eq!(result.rows.len(), 2);
        assert_eq!(result.rows[0][0], "John Doe");
        assert_eq!(
            result.rows[0][1],
            "A person with a comma, in the description"
        );
    }

    #[test]
    fn test_parse_csv_trims_whitespace() {
        let content = "  name  ,  age  \n  Alice  ,  30  ";
        let result = parse_csv_content(content, None).unwrap();

        assert_eq!(result.headers, vec!["name", "age"]);
        assert_eq!(result.rows[0], vec!["Alice", "30"]);
    }

    #[test]
    fn test_parse_empty_csv_fails() {
        let content = "";
        let result = parse_csv_content(content, None);

        assert!(result.is_err());
        match result {
            Err(CsvError::ParseError { message }) => {
                assert!(message.contains("headers"));
            }
            _ => panic!("Expected ParseError"),
        }
    }

    #[test]
    fn test_parse_csv_headers_only() {
        let content = "col1,col2,col3";
        let result = parse_csv_content(content, None).unwrap();

        assert_eq!(result.headers, vec!["col1", "col2", "col3"]);
        assert_eq!(result.rows.len(), 0);
        assert_eq!(result.total_rows, 0);
        assert!(!result.truncated);
    }

    #[test]
    fn test_max_rows_zero() {
        let content = "a,b\n1,2\n3,4";
        let result = parse_csv_content(content, Some(0)).unwrap();

        assert_eq!(result.headers, vec!["a", "b"]);
        assert_eq!(result.rows.len(), 0);
        assert_eq!(result.total_rows, 2);
        assert!(result.truncated);
    }

    #[tokio::test]
    async fn test_read_csv_file_not_found() {
        let result = read_csv(Path::new("/nonexistent/file.csv"), None).await;

        assert!(result.is_err());
        match result {
            Err(CsvError::ReadError { message }) => {
                assert!(message.contains("Failed to read file"));
            }
            _ => panic!("Expected ReadError"),
        }
    }

    // ========================================================================
    // Type Inference Tests
    // ========================================================================

    #[test]
    fn test_infer_integer_column() {
        let values: Vec<String> = vec!["1", "2", "3", "100", "1000"]
            .into_iter()
            .map(String::from)
            .collect();
        let result = infer_data_type(&values);
        assert!(matches!(result, DataType::Integer));
    }

    #[test]
    fn test_infer_integer_with_commas() {
        let values: Vec<String> = vec!["1,000", "2,500", "10,000", "1,000,000"]
            .into_iter()
            .map(String::from)
            .collect();
        let result = infer_data_type(&values);
        assert!(matches!(result, DataType::Integer));
    }

    #[test]
    fn test_infer_negative_integers() {
        let values: Vec<String> = vec!["-1", "-100", "50", "-1,000"]
            .into_iter()
            .map(String::from)
            .collect();
        let result = infer_data_type(&values);
        assert!(matches!(result, DataType::Integer));
    }

    #[test]
    fn test_infer_decimal_column() {
        let values: Vec<String> = vec!["1.5", "2.75", "3.0", "100.99"]
            .into_iter()
            .map(String::from)
            .collect();
        let result = infer_data_type(&values);
        assert!(matches!(result, DataType::Decimal { precision: Some(2) }));
    }

    #[test]
    fn test_infer_decimal_precision() {
        let values: Vec<String> = vec!["1.123", "2.456", "3.789"]
            .into_iter()
            .map(String::from)
            .collect();
        let result = infer_data_type(&values);
        assert!(matches!(result, DataType::Decimal { precision: Some(3) }));
    }

    #[test]
    fn test_infer_currency_usd() {
        let values: Vec<String> = vec!["$100.00", "$50.25", "$1,000.00"]
            .into_iter()
            .map(String::from)
            .collect();
        let result = infer_data_type(&values);
        assert!(matches!(result, DataType::Currency { code } if code == "USD"));
    }

    #[test]
    fn test_infer_currency_eur() {
        let values: Vec<String> = vec!["100 EUR", "50.25 EUR", "1000 EUR"]
            .into_iter()
            .map(String::from)
            .collect();
        let result = infer_data_type(&values);
        assert!(matches!(result, DataType::Currency { code } if code == "EUR"));
    }

    #[test]
    fn test_infer_currency_gbp() {
        let values: Vec<String> = vec!["GBP 100.00", "GBP 50.25", "GBP 1000"]
            .into_iter()
            .map(String::from)
            .collect();
        let result = infer_data_type(&values);
        assert!(matches!(result, DataType::Currency { code } if code == "GBP"));
    }

    #[test]
    fn test_infer_date_iso() {
        let values: Vec<String> = vec!["2024-01-15", "2024-02-20", "2023-12-31"]
            .into_iter()
            .map(String::from)
            .collect();
        let result = infer_data_type(&values);
        assert!(matches!(result, DataType::Date { format } if format == "YYYY-MM-DD"));
    }

    #[test]
    fn test_infer_date_us_format() {
        let values: Vec<String> = vec!["01/15/2024", "02/20/2024", "12/31/2023"]
            .into_iter()
            .map(String::from)
            .collect();
        let result = infer_data_type(&values);
        assert!(matches!(result, DataType::Date { format } if format == "MM/DD/YYYY"));
    }

    #[test]
    fn test_infer_date_european_format() {
        // When first component > 12, it must be day (DD/MM/YYYY)
        let values: Vec<String> = vec!["15/01/2024", "20/02/2024", "31/12/2023"]
            .into_iter()
            .map(String::from)
            .collect();
        let result = infer_data_type(&values);
        assert!(matches!(result, DataType::Date { format } if format == "DD/MM/YYYY"));
    }

    #[test]
    fn test_infer_datetime_iso() {
        let values: Vec<String> = vec![
            "2024-01-15T10:30:00",
            "2024-02-20T14:45:30",
            "2023-12-31T23:59:59",
        ]
        .into_iter()
        .map(String::from)
        .collect();
        let result = infer_data_type(&values);
        assert!(matches!(result, DataType::DateTime { format } if format == "YYYY-MM-DDTHH:mm:ss"));
    }

    #[test]
    fn test_infer_datetime_space_separator() {
        let values: Vec<String> = vec![
            "2024-01-15 10:30:00",
            "2024-02-20 14:45:30",
            "2023-12-31 23:59:59",
        ]
        .into_iter()
        .map(String::from)
        .collect();
        let result = infer_data_type(&values);
        assert!(matches!(result, DataType::DateTime { format } if format == "YYYY-MM-DD HH:mm:ss"));
    }

    #[test]
    fn test_infer_boolean_true_false() {
        let values: Vec<String> = vec!["true", "false", "true", "false"]
            .into_iter()
            .map(String::from)
            .collect();
        let result = infer_data_type(&values);
        assert!(matches!(result, DataType::Boolean));
    }

    #[test]
    fn test_infer_boolean_yes_no() {
        let values: Vec<String> = vec!["yes", "no", "Yes", "NO", "YES"]
            .into_iter()
            .map(String::from)
            .collect();
        let result = infer_data_type(&values);
        assert!(matches!(result, DataType::Boolean));
    }

    #[test]
    fn test_infer_boolean_one_zero() {
        let values: Vec<String> = vec!["1", "0", "1", "0", "1", "0", "1", "0", "1", "0"]
            .into_iter()
            .map(String::from)
            .collect();
        let result = infer_data_type(&values);
        assert!(matches!(result, DataType::Boolean));
    }

    #[test]
    fn test_infer_percentage() {
        let values: Vec<String> = vec!["50%", "25.5%", "100%", "0%"]
            .into_iter()
            .map(String::from)
            .collect();
        let result = infer_data_type(&values);
        assert!(matches!(result, DataType::Percentage));
    }

    #[test]
    fn test_infer_enum_status() {
        let values: Vec<String> = vec![
            "Active", "Inactive", "Pending", "Active", "Pending", "Inactive",
        ]
        .into_iter()
        .map(String::from)
        .collect();
        let result = infer_data_type(&values);
        match result {
            DataType::Enum { values } => {
                assert_eq!(values.len(), 3);
                assert!(values.contains(&"Active".to_string()));
                assert!(values.contains(&"Inactive".to_string()));
                assert!(values.contains(&"Pending".to_string()));
            }
            _ => panic!("Expected Enum type, got {:?}", result),
        }
    }

    #[test]
    fn test_infer_enum_categories() {
        let values: Vec<String> = vec![
            "Electronics",
            "Clothing",
            "Food",
            "Electronics",
            "Clothing",
            "Food",
            "Electronics",
        ]
        .into_iter()
        .map(String::from)
        .collect();
        let result = infer_data_type(&values);
        match result {
            DataType::Enum { values } => {
                assert_eq!(values.len(), 3);
            }
            _ => panic!("Expected Enum type"),
        }
    }

    #[test]
    fn test_infer_text_high_cardinality() {
        // More than 20 unique values should be Text, not Enum
        let values: Vec<String> = (1..=25).map(|i| format!("unique_value_{}", i)).collect();
        let result = infer_data_type(&values);
        assert!(matches!(result, DataType::Text));
    }

    #[test]
    fn test_infer_text_fallback() {
        let values: Vec<String> = vec![
            "Hello world",
            "This is text",
            "Random string 123",
            "Another value",
        ]
        .into_iter()
        .map(String::from)
        .collect();
        let result = infer_data_type(&values);
        // With only 4 unique values, could be Enum
        match result {
            DataType::Text | DataType::Enum { .. } => {}
            _ => panic!("Expected Text or Enum type"),
        }
    }

    #[test]
    fn test_infer_empty_values() {
        let values: Vec<String> = vec!["", "", ""]
            .into_iter()
            .map(String::from)
            .collect();
        let result = infer_data_type(&values);
        assert!(matches!(result, DataType::Text));
    }

    #[test]
    fn test_infer_mixed_empty_and_values() {
        // Empty values should be ignored for type detection
        let values: Vec<String> = vec!["100", "", "200", "", "300"]
            .into_iter()
            .map(String::from)
            .collect();
        let result = infer_data_type(&values);
        assert!(matches!(result, DataType::Integer));
    }

    #[test]
    fn test_infer_type_with_hint_date() {
        let values: Vec<String> = vec!["2024-01-15", "2024-02-20", "2023-12-31"]
            .into_iter()
            .map(String::from)
            .collect();
        let (data_type, hint) = infer_data_type_with_hint(&values);
        assert!(matches!(data_type, DataType::Date { format } if format == "YYYY-MM-DD"));
        assert!(hint.is_some());
        assert_eq!(hint.unwrap().pattern, Some("YYYY-MM-DD".to_string()));
    }

    #[test]
    fn test_infer_type_with_hint_currency() {
        let values: Vec<String> = vec!["$100.00", "$50.25", "$1,000.00"]
            .into_iter()
            .map(String::from)
            .collect();
        let (data_type, hint) = infer_data_type_with_hint(&values);
        assert!(matches!(data_type, DataType::Currency { code } if code == "USD"));
        assert!(hint.is_some());
        let hint = hint.unwrap();
        assert_eq!(hint.pattern, Some("USD #,##0.00".to_string()));
        assert_eq!(hint.locale, Some("en-US".to_string()));
    }

    #[test]
    fn test_sample_values_small_dataset() {
        let values: Vec<&str> = (0..50).map(|_| "test").collect();
        let sampled = sample_values(&values);
        assert_eq!(sampled.len(), 50);
    }

    #[test]
    fn test_sample_values_large_dataset() {
        let values: Vec<&str> = (0..1000).map(|_| "test").collect();
        let sampled = sample_values(&values);
        assert_eq!(sampled.len(), TYPE_INFERENCE_SAMPLE_SIZE);
    }

    #[test]
    fn test_threshold_detection() {
        // 90% threshold should work
        assert!(meets_threshold(90, 100));
        assert!(meets_threshold(95, 100));
        assert!(!meets_threshold(89, 100));
    }
}
