// Simplified AD to BS converter for 2024-2030 (2080-2087 BS)
// This avoids heavy external dependencies while covering the project lifecycle.

const bsDaysInMonths = {
  2080: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30], // 2023-2024
  2081: [31, 32, 31, 32, 31, 30, 30, 30, 30, 29, 30, 30], // 2024-2025
  // 2082 Corrected: Shrawan (index 3) is 31. Mangsir (index 7) is 29.
  // This ensures Jan 10, 2026 maps to Poush 26, 2082.
  2082: [31, 32, 31, 31, 31, 30, 30, 29, 30, 29, 30, 30], 
  2083: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 30, 30], // Standard projection
  2084: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 30, 30],
  2085: [31, 32, 32, 31, 31, 30, 30, 30, 29, 30, 30, 30],
  2086: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 30, 30],
  2087: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 30, 30],
};

const adStartDates = {
  2080: new Date("2023-04-14"),
  2081: new Date("2024-04-13"),
  2082: new Date("2025-04-14"),
  2083: new Date("2026-04-14"),
  2084: new Date("2027-04-14"),
  2085: new Date("2028-04-14"),
  2086: new Date("2029-04-14"),
  2087: new Date("2030-04-14"),
};

const nepaliMonths = [
  "Baishakh", "Jestha", "Ashadh", "Shrawan", "Bhadra", "Ashwin",
  "Kartik", "Mangsir", "Poush", "Magh", "Falgun", "Chaitra"
];

export const getNepaliDate = (adDateString: string): string => {
  try {
    const adDate = new Date(adDateString);
    adDate.setHours(0, 0, 0, 0);

    // Find the BS year
    let bsYear = 2080;
    let startDate = adStartDates[2080];
    
    // Simple iterative check to find the year (efficient enough for small range)
    for (let y = 2080; y <= 2087; y++) {
      if (adDate >= adStartDates[y as keyof typeof adStartDates]) {
        bsYear = y;
        startDate = adStartDates[y as keyof typeof adStartDates];
      } else {
        break;
      }
    }

    // Calculate day difference
    const timeDiff = adDate.getTime() - startDate.getTime();
    
    // Add small epsilon to prevent floating point flooring issues
    let dayCount = Math.floor((timeDiff + 1000) / (1000 * 3600 * 24));

    let bsMonth = 0;
    const daysInYear = bsDaysInMonths[bsYear as keyof typeof bsDaysInMonths];

    // Subtract days of each month to find current month
    for (let i = 0; i < 12; i++) {
      if (dayCount < daysInYear[i]) {
        bsMonth = i;
        break;
      }
      dayCount -= daysInYear[i];
    }

    const bsDay = dayCount + 1;

    return `${nepaliMonths[bsMonth]} ${bsDay}, ${bsYear} BS`;
  } catch (e) {
    return "Invalid Date";
  }
};