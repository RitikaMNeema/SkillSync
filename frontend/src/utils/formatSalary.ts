export function formatSalary(min?: number | null, max?: number | null) {
  if (min == null && max == null) return "Salary not listed";
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  });

  if (min != null && max != null) {
    return `${formatter.format(min)} - ${formatter.format(max)}`;
  }

  return formatter.format(min ?? max ?? 0);
}
