export function formatTime(time24: string, format: "12h" | "24h"): string {
  if (!time24) return "";
  const [h, m] = time24.split(":").map(Number);
  if (format === "24h") {
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
  }
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

export function getTimeOfDayRanges(format: "12h" | "24h") {
  if (format === "24h") {
    return [
      { value: "early_morning", label: "Early Morning", range: "00:00 – 05:59" },
      { value: "morning", label: "Morning", range: "06:00 – 08:59" },
      { value: "late_morning", label: "Late Morning", range: "09:00 – 11:59" },
      { value: "afternoon", label: "Afternoon", range: "12:00 – 14:59" },
      { value: "late_afternoon", label: "Late Afternoon", range: "15:00 – 17:59" },
      { value: "evening", label: "Evening", range: "18:00 – 23:59" },
      { value: "waking_hours", label: "Waking Hours", range: "08:00 – 19:59" },
    ];
  }
  return [
    { value: "early_morning", label: "Early Morning", range: "12:00 AM – 5:59 AM" },
    { value: "morning", label: "Morning", range: "6:00 AM – 8:59 AM" },
    { value: "late_morning", label: "Late Morning", range: "9:00 AM – 11:59 AM" },
    { value: "afternoon", label: "Afternoon", range: "12:00 PM – 2:59 PM" },
    { value: "late_afternoon", label: "Late Afternoon", range: "3:00 PM – 5:59 PM" },
    { value: "evening", label: "Evening", range: "6:00 PM – 11:59 PM" },
    { value: "waking_hours", label: "Waking Hours", range: "8:00 AM – 7:59 PM" },
  ];
}
