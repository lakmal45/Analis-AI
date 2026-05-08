// Placeholder test file for backend
// Add real tests with your preferred test runner (Vitest/Jest)

function sum(a, b) {
  return a + b;
}

if (require.main === module) {
  console.log("sum(1,2)=", sum(1, 2));
}

module.exports = { sum };
