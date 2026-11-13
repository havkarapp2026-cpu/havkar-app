"use strict";

function pad2(value) {
  return String(value).padStart(2, "0");
}

function isLeapYear(year) {
  const y = Number(year);
  if (!Number.isInteger(y) || y < 1) return false;
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function daysInMonth(year, month) {
  const m = Number(month);
  const y = Number(year);
  if (!Number.isInteger(m) || m < 1 || m > 12) return 0;
  if ([1, 3, 5, 7, 8, 10, 12].includes(m)) return 31;
  if ([4, 6, 9, 11].includes(m)) return 30;
  return isLeapYear(y) ? 29 : 28;
}

/**
 * Compose and validate a calendar date from separate day/month/year parts.
 * Returns YYYY-MM-DD for Duffel born_on, or null when invalid.
 */
function composeFlightDob(day, month, year) {
  const d = Number(day);
  const m = Number(month);
  const y = Number(year);
  if (!Number.isInteger(d) || !Number.isInteger(m) || !Number.isInteger(y)) {
    return null;
  }
  if (y < 1900 || y > 2100) return null;
  if (m < 1 || m > 12) return null;
  const dim = daysInMonth(y, m);
  if (d < 1 || d > dim) return null;
  const iso = `${y}-${pad2(m)}-${pad2(d)}`;
  // Reject impossible JS Date drift (e.g. timezone edge cases for local Date)
  const check = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(check.getTime())) return null;
  if (
    check.getUTCFullYear() !== y ||
    check.getUTCMonth() + 1 !== m ||
    check.getUTCDate() !== d
  ) {
    return null;
  }
  return iso;
}

function parseFlightDobParts(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || "").trim());
  if (!match) return null;
  const composed = composeFlightDob(match[3], match[2], match[1]);
  if (!composed) return null;
  return {
    year: match[1],
    month: match[2],
    day: match[3],
    iso: composed
  };
}

module.exports = {
  pad2,
  isLeapYear,
  daysInMonth,
  composeFlightDob,
  parseFlightDobParts
};
