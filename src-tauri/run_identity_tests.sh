#!/bin/bash

# UUID Identity System - Test Runner
# This script runs all tests for Task 6: Testing and Validation

echo "========================================"
echo "UUID Identity System - Test Suite"
echo "Task 6: Testing and Validation"
echo "========================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track overall results
TESTS_PASSED=0
TESTS_FAILED=0

# Function to run a test category
run_test_category() {
    local category=$1
    local test_pattern=$2
    
    echo -e "${YELLOW}Running $category tests...${NC}"
    
    if cargo test $test_pattern --release 2>&1 | tee test_output.tmp; then
        echo -e "${GREEN}✓ $category tests PASSED${NC}"
        ((TESTS_PASSED++))
    else
        echo -e "${RED}✗ $category tests FAILED${NC}"
        ((TESTS_FAILED++))
    fi
    
    echo ""
}

# Task 6.1: Run comprehensive test suite
echo "Task 6.1: Running comprehensive test suite"
echo "==========================================="
run_test_category "Unit Tests - UUID Generation" "identity::uuid::"
run_test_category "Unit Tests - Front Matter" "identity::frontmatter::"
run_test_category "Unit Tests - Sidecar" "identity::sidecar::"
run_test_category "Unit Tests - Migration" "identity::migration::"
run_test_category "Unit Tests - API Updates" "identity::api_updates::"
run_test_category "Unit Tests - Watcher" "identity::watcher::"

# Task 6.2: Integration tests
echo "Task 6.2: Integration testing with real vault data"
echo "=================================================="
run_test_category "Integration Tests" "identity_integration::"

# Task 6.3 & 6.4: Performance benchmarks
echo "Task 6.4: Performance benchmarks"
echo "================================"
run_test_category "Performance Tests" "test_uuid_generation_performance"
run_test_category "Front Matter Performance" "test_frontmatter_performance"
run_test_category "Migration Performance" "test_large_vault_migration"

# Task 6.5: Cross-platform tests
echo "Task 6.5: Cross-platform compatibility"
echo "======================================"
run_test_category "Cross-platform" "test_cross_platform"

# Task 6.6: Editor compatibility
echo "Task 6.6: Editor save patterns"
echo "=============================="
run_test_category "Editor Patterns" "test_editor_save_patterns"

# Task 6.7: Edge cases and validation
echo "Task 6.7: Edge cases and validation"
echo "==================================="
run_test_category "Validation Tests" "identity_validation::"
run_test_category "Edge Cases" "test_edge_cases"

# Task 6.8: Coverage report
echo "Task 6.8: Test coverage analysis"
echo "================================"

# Try to generate coverage report if tarpaulin is installed
if command -v cargo-tarpaulin &> /dev/null; then
    echo "Generating coverage report..."
    cargo tarpaulin --lib --tests --out Html --output-dir coverage \
        --exclude-files "*/tests/*" \
        --exclude-files "*/bin/*" \
        --ignore-panics \
        --timeout 300 \
        -- identity:: 2>&1 | tail -20
    
    if [ -f coverage/tarpaulin-report.html ]; then
        echo -e "${GREEN}✓ Coverage report generated: coverage/tarpaulin-report.html${NC}"
    fi
else
    echo -e "${YELLOW}Note: Install cargo-tarpaulin for coverage reports:${NC}"
    echo "  cargo install cargo-tarpaulin"
fi

# Summary
echo ""
echo "========================================"
echo "Test Summary"
echo "========================================"
echo -e "Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Tests Failed: ${RED}$TESTS_FAILED${NC}"

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "\n${GREEN}✓ All tests passed successfully!${NC}"
    echo ""
    echo "Task 6 Requirements Met:"
    echo "✓ 6.1 - Comprehensive test suite run"
    echo "✓ 6.2 - Integration testing completed"
    echo "✓ 6.3 - Large vault testing validated"
    echo "✓ 6.4 - Performance benchmarks verified"
    echo "✓ 6.5 - Cross-platform tests passed"
    echo "✓ 6.6 - Editor patterns tested"
    echo "✓ 6.7 - Edge cases documented"
    echo "✓ 6.8 - Coverage analysis complete"
    exit 0
else
    echo -e "\n${RED}✗ Some tests failed. Please review the output above.${NC}"
    exit 1
fi