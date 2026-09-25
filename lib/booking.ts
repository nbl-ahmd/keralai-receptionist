/**
 * booking.ts
 *
 * Booking service: availability, validation, and calendar exports.
 *
 * Keeps slot rules in one place so the voice agent, the dashboard, and any
 * external calendar integration agree on what "bookable" means.
 */

import { Appointment } from "../types";
import { addAppointment, getAppointments } from "./store";

export interface BookingSettings {
  /** Opening time, 24h "HH:MM". */
  openTime: string;
  /** Closing time, 24h "HH:MM". */
  closeTime: string;
  /** Slot length in minutes. */
  slotMinutes: number;
  /** 0 = Sunday … 6 = Saturday. */
  openDays: number[];
  /** How many days ahead callers may book. */
  horizonDays: number;
}

function parseSettings(): BookingSettings {
  const openDays = (process.env.BOOKING_OPEN_DAYS ?? "1,2,3,4,5,6")
    .split(",")
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6);

  return {
    openTime: process.env.BOOKING_OPEN_TIME ?? "09:00",
    closeTime: process.env.BOOKING_CLOSE_TIME ?? "18:00",
    slotMinutes: Number.parseInt(process.env.BOOKING_SLOT_MINUTES ?? "30", 10),
    openDays: openDays.length > 0 ? openDays : [1, 2, 3, 4, 5, 6],
    horizonDays: Number.parseInt(process.env.BOOKING_HORIZON_DAYS ?? "30", 10),
  };
}

export const bookingSettings = parseSettings();

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map((value) => Number.parseInt(value, 10));
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return Number.NaN;
  return hours * 60 + minutes;
}

function toTimeString(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
}

export interface BookingValidation {
  ok: boolean;
  reason?: string;
  normalisedDate?: string;
  normalisedTime?: string;
}

/** Validates a requested slot against business hours and the booking horizon. */
export function validateBookingRequest(date: string, time: string): BookingValidation {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!dateMatch) {
    return { ok: false, reason: "Date must be in YYYY-MM-DD format." };
  }

  const requested = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(requested.getTime())) {
    return { ok: false, reason: "That date is not valid." };
  }

  const today = new Date();
  const todayUtc = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );

  if (requested.getTime() < todayUtc.getTime()) {
    return { ok: false, reason: "That date is in the past." };
  }

  const horizon = new Date(todayUtc.getTime() + bookingSettings.horizonDays * 86_400_000);
  if (requested.getTime() > horizon.getTime()) {
    return {
      ok: false,
      reason: `Bookings are only open ${bookingSettings.horizonDays} days ahead.`,
    };
  }

  if (!bookingSettings.openDays.includes(requested.getUTCDay())) {
    return { ok: false, reason: "We are closed on that day." };
  }

  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!timeMatch) {
    return { ok: false, reason: "Time must be in HH:MM format." };
  }

  const minutes = toMinutes(`${timeMatch[1].padStart(2, "0")}:${timeMatch[2]}`);
  const open = toMinutes(bookingSettings.openTime);
  const close = toMinutes(bookingSettings.closeTime);

  if (Number.isNaN(minutes) || minutes < open || minutes >= close) {
    return {
      ok: false,
      reason: `We take bookings between ${bookingSettings.openTime} and ${bookingSettings.closeTime}.`,
    };
  }

  if ((minutes - open) % bookingSettings.slotMinutes !== 0) {
    return {
      ok: false,
      reason: `Slots are every ${bookingSettings.slotMinutes} minutes.`,
    };
  }

  return {
    ok: true,
    normalisedDate: date,
    normalisedTime: toTimeString(minutes),
  };
}

/** Returns the bookable slots for a date, excluding already-taken ones. */
export async function getAvailability(tenantId: string, date: string): Promise<{
  date: string;
  slots: { time: string; available: boolean }[];
  closed: boolean;
}> {
  const validation = validateBookingRequest(date, bookingSettings.openTime);
  if (!validation.ok && validation.reason === "We are closed on that day.") {
    return { date, slots: [], closed: true };
  }

  const open = toMinutes(bookingSettings.openTime);
  const close = toMinutes(bookingSettings.closeTime);

  const appointments = await getAppointments(tenantId);
  const taken = new Set(
    appointments
      .filter((apt) => apt.date === date && apt.status !== "cancelled")
      .map((apt) => apt.time.slice(0, 5)),
  );

  const slots: { time: string; available: boolean }[] = [];
  for (let minutes = open; minutes < close; minutes += bookingSettings.slotMinutes) {
    const time = toTimeString(minutes);
    slots.push({ time, available: !taken.has(time) });
  }

  return { date, slots, closed: false };
}

/** Books a validated appointment, returning the saved record. */
export async function bookAppointment(
  tenantId: string,
  input: {
    customerName: string;
    date: string;
    time: string;
    reason?: string;
    callSid?: string;
    customerPhone?: string;
    customerEmail?: string;
  },
): Promise<{ ok: true; appointment: Appointment } | { ok: false; reason: string }> {
  const validation = validateBookingRequest(input.date, input.time);
  if (!validation.ok) {
    return { ok: false, reason: validation.reason ?? "That slot is not available." };
  }

  const appointments = await getAppointments(tenantId);
  const clash = appointments.find(
    (apt) =>
      apt.date === validation.normalisedDate &&
      apt.time.slice(0, 5) === validation.normalisedTime &&
      apt.status !== "cancelled",
  );
  if (clash) {
    return { ok: false, reason: "That slot is already booked. Please offer another time." };
  }

  const appointment: Appointment = {
    id: crypto.randomUUID(),
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    date: validation.normalisedDate!,
    time: validation.normalisedTime!,
    reason: input.reason,
    status: "confirmed",
    callSid: input.callSid,
    createdAt: new Date().toISOString(),
  };

  const saved = await addAppointment(tenantId, appointment);
  return { ok: true, appointment: saved };
}

/** Builds an RFC 5545 calendar invite for a booking. */
export function buildIcs(appointment: Appointment, companyName = "Appointment"): string {
  const start = appointment.date.replace(/-/g, "");
  const [hours, minutes] = appointment.time.split(":");
  const startStamp = `${start}T${hours}${minutes}00`;
  const endMinutes = Number(hours) * 60 + Number(minutes) + bookingSettings.slotMinutes;
  const endStamp = `${start}T${Math.floor(endMinutes / 60)
    .toString()
    .padStart(2, "0")}${(endMinutes % 60).toString().padStart(2, "0")}00`;

  const uid = `${appointment.id}@keralai`;
  const summary = appointment.reason ? `${companyName}: ${appointment.reason}` : companyName;

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//KeralAI//Receptionist//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").split(".")[0]}Z`,
    `DTSTART:${startStamp}`,
    `DTEND:${endStamp}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${appointment.customerName} — booked by the KeralAI voice agent`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}
