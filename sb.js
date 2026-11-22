/* Kleiner Supabase-Zugang ohne fremde Bibliothek: Anmeldung per Code, Datenbank, Dateien. */
(function () {
  "use strict";
  var C = window.APP_CONFIG;
  var SITZUNG_KEY = "gbwm-sitzung";

  function lesen(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function schreiben(k, v) {
    try { if (v === null || v === undefined) { localStorage.removeItem(k); } else { localStorage.setItem(k, JSON.stringify(v)); } } catch (e) { /* kein Speicher */ }
  }

  var sitzung = lesen(SITZUNG_KEY);

  function anfrage(pfad, opt) {
    opt = opt || {};
    var kopf = { apikey: C.key };
    if (!opt.roh) { kopf["Content-Type"] = "application/json"; }
    Object.keys(opt.kopf || {}).forEach(function (k) { kopf[k] = opt.kopf[k]; });
    if (opt.token) { kopf.Authorization = "Bearer " + opt.token; }
    var methode = opt.methode || (opt.body !== undefined ? "POST" : "GET");
    var body = opt.body === undefined ? undefined : (opt.roh ? opt.body : JSON.stringify(opt.body));
    return fetch(C.url + pfad, { method: methode, headers: kopf, body: body }).then(function (r) {
      return r.text().then(function (text) {
        var daten = null;
        try { daten = text ? JSON.parse(text) : null; } catch (e) { daten = text; }
        if (!r.ok) {
          var f = new Error((daten && (daten.msg || daten.message || daten.error_description || daten.error)) || ("Fehler " + r.status));
          f.status = r.status; f.code = daten && (daten.error_code || daten.code); f.daten = daten;
          throw f;
        }
        return daten;
      });
    });
  }

  function merken(d) {
    sitzung = {
      access_token: d.access_token,
      refresh_token: d.refresh_token,
      ablauf: Date.now() + (d.expires_in || 3600) * 1000,
      user: { id: d.user.id, email: d.user.email }
    };
    schreiben(SITZUNG_KEY, sitzung);
    return sitzung;
  }

  function vergessen() { sitzung = null; schreiben(SITZUNG_KEY, null); }

  // Gültigen Zugangsschein holen, bei Bedarf erneuern. Ohne Netz bleibt die Sitzung erhalten.
  function token() {
    if (!sitzung) { return Promise.reject(Object.assign(new Error("Nicht angemeldet"), { status: 401 })); }
    if (Date.now() < sitzung.ablauf - 60000) { return Promise.resolve(sitzung.access_token); }
    return anfrage("/auth/v1/token?grant_type=refresh_token", { body: { refresh_token: sitzung.refresh_token } })
      .then(function (d) { merken(d); return sitzung.access_token; })
      .catch(function (f) { if (f.status >= 400 && f.status < 500) { vergessen(); } throw f; });
  }

  function mitToken(pfad, opt) {
    return token().then(function (t) { opt = opt || {}; opt.token = t; return anfrage(pfad, opt); });
  }

  function pfadKodieren(p) { return p.split("/").map(encodeURIComponent).join("/"); }

  window.SB = {
    nutzer: function () { return sitzung ? sitzung.user : null; },

    // Anmeldung über den Telegram-Bot: nachfragen, ob die Person im Bot bestätigt hat
    telegramAbholen: function (schluessel) {
      return anfrage("/functions/v1/telegram", { body: { aktion: "abholen", schluessel: schluessel } }).then(function (d) {
        if (d && d.bereit && d.sitzung) { merken(d.sitzung); return true; }
        return false;
      });
    },
    abmelden: function () {
      var t = sitzung && sitzung.access_token;
      vergessen();
      if (!t) { return Promise.resolve(); }
      return anfrage("/auth/v1/logout", { methode: "POST", token: t }).catch(function () {});
    },

    // Datenbank (Tabellen und Funktionen)
    rest: function (pfad, opt) { return mitToken("/rest/v1/" + pfad, opt); },
    rpc: function (name, args) { return mitToken("/rest/v1/rpc/" + name, { body: args || {} }); },

    // Server-Funktionen (Freigabe über die Admin-Seite)
    funktion: function (name, body) { return mitToken("/functions/v1/" + name, { body: body || {} }); },

    // Dateien im privaten Speicher
    signieren: function (pfade, sekunden) {
      if (!pfade.length) { return Promise.resolve({}); }
      return mitToken("/storage/v1/object/sign/inhalte", { body: { expiresIn: sekunden, paths: pfade } }).then(function (liste) {
        var karte = {};
        (liste || []).forEach(function (e) { if (e && e.signedURL && !e.error) { karte[e.path] = C.url + "/storage/v1" + e.signedURL; } });
        return karte;
      });
    },
    dateiHochladen: function (pfad, datei) {
      return mitToken("/storage/v1/object/inhalte/" + pfadKodieren(pfad), {
        methode: "POST", roh: true, body: datei,
        kopf: { "x-upsert": "true", "Content-Type": datei.type || "application/octet-stream", "Cache-Control": "max-age=604800" }
      });
    },
    dateienAuflisten: function (ordner) {
      return mitToken("/storage/v1/object/list/inhalte", { body: { prefix: ordner, limit: 1000, offset: 0 } });
    },
    dateienLoeschen: function (pfade) {
      if (!pfade.length) { return Promise.resolve([]); }
      return mitToken("/storage/v1/object/inhalte", { methode: "DELETE", body: { prefixes: pfade } });
    }
  };
})();
