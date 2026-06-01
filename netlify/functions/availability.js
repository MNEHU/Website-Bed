// netlify/functions/availability.js
//
// Deze functie haalt de iCal-feeds van Airbnb, Booking.com en Google Calendar op,
// voegt ze samen, en geeft een lijst met bezette datums terug aan de website.
//
// === INSTELLEN ===
// Vul hieronder je eigen iCal-links in (de .ics-URL's).
// Waar je ze vindt:
//   - Airbnb:      Vermelding > Beschikbaarheid > Agenda's synchroniseren > Agenda exporteren
//   - Booking.com: Tarieven & beschikbaarheid > Agenda synchroniseren > Exporteren
//   - Google:      Agenda-instellingen > Integreren > Geheim adres in iCal-indeling
//
// Tip: zet de links liever als omgevingsvariabelen in Netlify
// (Site settings > Environment variables) i.p.v. hier hardcoded.

const ICAL_FEEDS = [
  process.env.AIRBNB_ICAL   || "",   // bv. https://www.airbnb.com/calendar/ical/12345.ics?s=...
  process.env.BOOKING_ICAL  || "",   // bv. https://admin.booking.com/hotel/.../ical/...
  process.env.GOOGLE_ICAL   || "",   // bv. https://calendar.google.com/calendar/ical/.../basic.ics
].filter(Boolean);

// Eenvoudige iCal-parser: pakt alle VEVENT-blokken en hun DTSTART/DTEND.
function parseICal(text) {
  const dates = new Set();
  const events = text.split("BEGIN:VEVENT").slice(1);
  for (const ev of events) {
    const startMatch = ev.match(/DTSTART[^:]*:(\d{8})/);
    const endMatch   = ev.match(/DTEND[^:]*:(\d{8})/);
    if (!startMatch) continue;
    const start = toDate(startMatch[1]);
    // DTEND in iCal is exclusief (de vertrekdag is weer vrij), dus tot < end.
    const end = endMatch ? toDate(endMatch[1]) : addDays(start, 1);
    for (let d = new Date(start); d < end; d = addDays(d, 1)) {
      dates.add(keyOf(d));
    }
  }
  return dates;
}

function toDate(yyyymmdd) {
  const y = +yyyymmdd.slice(0, 4);
  const m = +yyyymmdd.slice(4, 6) - 1;
  const d = +yyyymmdd.slice(6, 8);
  return new Date(y, m, d);
}
function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}
function keyOf(d) {
  return d.getFullYear() + "-" +
    String(d.getMonth() + 1).padStart(2, "0") + "-" +
    String(d.getDate()).padStart(2, "0");
}

exports.handler = async function () {
  const allBooked = new Set();

  await Promise.all(
    ICAL_FEEDS.map(async (url) => {
      try {
        const res = await fetch(url);
        if (!res.ok) return;
        const text = await res.text();
        parseICal(text).forEach((d) => allBooked.add(d));
      } catch (e) {
        // Eén kapotte feed mag de rest niet blokkeren.
        console.error("Feed mislukt:", url, e.message);
      }
    })
  );

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600", // 1 uur cachen
    },
    body: JSON.stringify({ booked: Array.from(allBooked).sort() }),
  };
};
