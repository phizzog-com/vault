# Task UUID Implementation Validation Test

## Test Tasks
- [ ] Simple task without properties
- [ ] Task with due date @due(2025-08-30)
- [x] Completed task with priority !high
- [ ] Task with tags #work #urgent @project(website-redesign)
- [ ] Task with natural language date @due(tomorrow) !p2

## Tasks with IDs (should preserve)
- [ ] Task with existing ID <!-- tid: 018f8a48-1234-5678-90ab-cdef12345678 -->
- [x] Completed task with ID @due(2025-09-01) <!-- tid: 018f8a48-abcd-ef12-3456-789012345678 -->