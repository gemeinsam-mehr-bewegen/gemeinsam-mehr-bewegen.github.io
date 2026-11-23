/* Hülle der Team-App: Anmeldung über Telegram, Wartebildschirm, Laden der freigegebenen Inhalte.
   Alle Kursinhalte, die Kurs-Technik und das Kursaussehen kommen erst nach der Freigabe aus Supabase. */
(function () {
  "use strict";
  var S = window.SB;
  var C = window.APP_CONFIG;
  var app = document.getElementById("app");
  var fuss = document.getElementById("fuss");
  var CACHE_KEY = "gbwm-inhalte";
  var WARTE_KEY = "gbwm-telegram-anmeldung";
  var ANMELDE_DAUER = 15 * 60 * 1000; // so lange gilt ein Anmeldevorgang
  var LINK_DAUER = 7 * 24 * 60 * 60; // signierte Links gelten 7 Tage, damit das Handy Bilder zwischenspeichern kann
  var TITEL = "Gemeinsam mehr bewegen";
  var pruefTimer = null;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }
  function lesen(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function schreiben(k, v) {
    try { if (v == null) { localStorage.removeItem(k); } else { localStorage.setItem(k, JSON.stringify(v)); } } catch (e) { /* voll oder gesperrt */ }
  }
  function zeige(html) { clearTimeout(pruefTimer); app.innerHTML = html; window.scrollTo(0, 0); }
  function kopf(vorzeile, titel, text) {
    return '<header class="h-kopf">' + (vorzeile ? '<p class="h-vorzeile">' + esc(vorzeile) + '</p>' : '') +
      '<h1>' + esc(titel) + '</h1>' + (text ? '<p>' + text + '</p>' : '') + '</header>';
  }

  /* ---------- Fußzeile ---------- */
  function zeigeFuss(admin) {
    var teile = ['<a href="datenschutz.html">Datenschutz</a>'];
    if (admin) { teile.push('<a href="admin.html">Admin</a>'); }
    if (S.nutzer()) { teile.push('<button type="button" id="abmelden">Abmelden</button>'); }
    fuss.innerHTML = teile.join("");
    fuss.hidden = false;
    var b = document.getElementById("abmelden");
    if (b) {
      b.addEventListener("click", function () {
        if (!window.confirm("Möchtest du dich abmelden? Zum nächsten Anmelden tippst du wieder auf „Mit Telegram anmelden“.")) { return; }
        schreiben(CACHE_KEY, null);
        S.abmelden().then(function () { location.href = location.pathname; });
      });
    }
  }

  /* ---------- Anmeldung über Telegram ---------- */
  function zufallsSchluessel() {
    var b = new Uint8Array(32);
    crypto.getRandomValues(b);
    return btoa(String.fromCharCode.apply(null, b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function telegramLink(schluessel) { return "https://t.me/" + encodeURIComponent(C.bot) + "?start=" + schluessel; }

  function zeigeAnmeldung(meldung) {
    zeigeFuss(false);
    zeige(
      kopf("Team-App", TITEL, "Schön, dass du da bist. Du meldest dich mit Telegram an. Ein Passwort brauchst du nicht.") +
      '<section class="h-karte">' +
        '<label class="h-haken"><input type="checkbox" id="f-ds"><span>Ich habe den <a href="datenschutz.html" target="_blank" rel="noopener">Datenschutzhinweis</a> gelesen.</span></label>' +
        '<button class="h-knopf" type="button" id="tg-los">Mit Telegram anmelden</button>' +
        '<p class="h-meldung" id="meldung">' + esc(meldung || "") + '</p>' +
        '<p class="h-leise">Telegram öffnet sich. Tippe dort auf „Start“ und bestätige mit „Ja, das bin ich“. Danach kommst du hierher zurück.</p>' +
        '<p class="h-leise">Du hast kein Telegram? Dann sprich bitte deine Mentorin bzw. deinen Mentor an.</p>' +
      '</section>'
    );
    document.getElementById("tg-los").addEventListener("click", function () {
      if (!document.getElementById("f-ds").checked) {
        document.getElementById("meldung").textContent = "Bitte bestätige zuerst, dass du den Datenschutzhinweis gelesen hast.";
        return;
      }
      var vorgang = { schluessel: zufallsSchluessel(), zeit: Date.now() };
      schreiben(WARTE_KEY, vorgang);
      zeigeTelegramWarten();
      window.location.href = telegramLink(vorgang.schluessel);
    });
  }

  function laufenderVorgang() {
    var v = lesen(WARTE_KEY);
    return v && v.schluessel && Date.now() - v.zeit < ANMELDE_DAUER ? v : null;
  }

  function zeigeTelegramWarten(meldung) {
    var v = laufenderVorgang();
    if (!v) { schreiben(WARTE_KEY, null); return zeigeAnmeldung(meldung); }
    zeige(
      kopf("Anmeldung", "Bestätige in Telegram", "Tippe im Bot auf „Start“ und dann auf <strong>„Ja, das bin ich“</strong>. Diese Seite merkt es von selbst.") +
      '<section class="h-karte">' +
        '<a class="h-knopf" id="tg-auf" href="' + esc(telegramLink(v.schluessel)) + '">Telegram öffnen</a>' +
        '<p class="h-meldung" id="meldung">' + esc(meldung || "") + '</p>' +
        '<button class="h-knopf zweit" type="button" id="abbrechen">Abbrechen</button>' +
      '</section>'
    );
    document.getElementById("abbrechen").addEventListener("click", function () { schreiben(WARTE_KEY, null); zeigeAnmeldung(); });
    abholen();
  }

  var abholenLaeuft = false;
  function abholen() {
    clearTimeout(pruefTimer);
    // Schon angemeldet (z. B. in einem anderen Tab fertig geworden): Vorgang still beenden
    if (S.nutzer()) { schreiben(WARTE_KEY, null); return start(); }
    var gespeichert = lesen(WARTE_KEY);
    var v = laufenderVorgang();
    if (!v) {
      schreiben(WARTE_KEY, null);
      // Meldung nur, wenn wirklich ein angefangener Vorgang abgelaufen ist
      return zeigeAnmeldung(gespeichert && gespeichert.schluessel
        ? "Die Anmeldung hat zu lange gedauert. Bitte tippe noch einmal auf „Mit Telegram anmelden“."
        : "");
    }
    if (abholenLaeuft) { return; } // nie zwei Abfragen gleichzeitig
    abholenLaeuft = true;
    S.telegramAbholen(v.schluessel).then(function (fertig) {
      abholenLaeuft = false;
      if (fertig || S.nutzer()) { schreiben(WARTE_KEY, null); return start(); }
      var jetzt = lesen(WARTE_KEY);
      if (!jetzt || jetzt.schluessel !== v.schluessel) { return; } // abgebrochen oder neu begonnen
      pruefTimer = setTimeout(abholen, 2500);
    }).catch(function () {
      abholenLaeuft = false;
      if (S.nutzer()) { return; }
      var m = document.getElementById("meldung");
      if (m) { m.textContent = "Gerade keine Verbindung. Es geht von selbst weiter, sobald du wieder Internet hast."; }
      pruefTimer = setTimeout(abholen, 5000);
    });
  }

  // Zurück aus Telegram: sofort nachschauen statt auf den nächsten Takt zu warten
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && !S.nutzer() && !abholenLaeuft && laufenderVorgang() && document.getElementById("tg-auf")) { abholen(); }
  });

  /* ---------- Warten, abgelehnt, gesperrt ---------- */
  function zeigeWarten(name) {
    zeige(
      kopf("Fast geschafft", "Danke" + (name ? ", " + name.split(" ")[0] : "") + "!", "") +
      '<section class="h-karte"><h2>Deine Anmeldung ist eingegangen</h2>' +
        '<p>Sobald du freigeschaltet bist, bekommst du eine Nachricht in Telegram. Dann kannst du hier direkt loslegen.</p>' +
        '<p class="h-leise">Diese Seite schaut auch selbst alle 30 Sekunden nach, solange sie offen ist.</p>' +
        '<button class="h-knopf zweit" type="button" id="pruefen">Jetzt nachschauen</button>' +
      '</section>'
    );
    document.getElementById("pruefen").addEventListener("click", start);
    pruefTimer = setTimeout(start, 30000);
  }

  function zeigeKeinZugang(status) {
    var text = status === "gesperrt"
      ? "Dein Zugang zur Team-App ist zurzeit nicht aktiv."
      : "Für dich ist die Team-App nicht freigeschaltet.";
    zeige(
      kopf("Team-App", TITEL, "") +
      '<section class="h-karte"><h2>Kein Zugang</h2><p>' + esc(text) + '</p>' +
        '<p>Wenn du denkst, dass das ein Irrtum ist, sprich bitte deine Mentorin bzw. deinen Mentor an.</p></section>'
    );
  }

  function zeigeFehler(text) {
    zeige(kopf("Team-App", TITEL, "") + '<section class="h-karte"><p>' + esc(text) + '</p>' +
      '<button class="h-knopf zweit" type="button" id="nochmal">Nochmal versuchen</button></section>');
    document.getElementById("nochmal").addEventListener("click", start);
  }

  /* ---------- Inhalte laden ---------- */
  // Sparsam: zuerst nur den Stand abfragen. Gleicher Stand und Links noch mindestens einen Tag gültig → Gespeichertes nutzen.
  function ladeInhalte() {
    return S.rest("inhalte?select=version&schluessel=eq.kurs").then(function (z) {
      var stand = z && z[0] && z[0].version;
      var c = lesen(CACHE_KEY);
      if (stand && c && c.version === stand && c.gueltigBis && c.gueltigBis - Date.now() > 24 * 3600 * 1000) { return c; }
      return ladeAlles();
    });
  }
  function ladeAlles() {
    return S.rest("inhalte?select=schluessel,daten,version").then(function (zeilen) {
      var d = {};
      (zeilen || []).forEach(function (z) { d[z.schluessel] = z; });
      if (!d.kurs || !d.app) { throw Object.assign(new Error("leer"), { leer: true }); }
      var dateien = (d.dateien && d.dateien.daten) || [];
      return S.signieren(dateien, LINK_DAUER).then(function (links) {
        return {
          version: d.kurs.version,
          kurs: d.kurs.daten,
          app: d.app.daten.code,
          stil: d.stil ? d.stil.daten.code : "",
          links: links,
          gueltigBis: Date.now() + LINK_DAUER * 1000
        };
      });
    });
  }

  var DATEI_MUSTER = /^(\.\/)?(bilder|pdf|spickzettel)\//;

  // Dateipfade wie "bilder/x.jpg" durch die signierten Links ersetzen
  function linkFuer(wert, links) {
    if (typeof wert !== "string" || !DATEI_MUSTER.test(wert)) { return null; }
    var p = wert.replace(/^\.\//, "").split("#")[0].split("?")[0];
    try { p = decodeURIComponent(p); } catch (e) { /* bleibt */ }
    return links[p] || null;
  }
  function tiefErsetzen(x, links) {
    if (typeof x === "string") { return linkFuer(x, links) || x; }
    if (Array.isArray(x)) { return x.map(function (y) { return tiefErsetzen(y, links); }); }
    if (x && typeof x === "object") {
      var o = {};
      Object.keys(x).forEach(function (k) { o[k] = tiefErsetzen(x[k], links); });
      return o;
    }
    return x;
  }

  // Auch Pfade, die die Kurs-Technik selbst zusammensetzt (PDF-Knopf, Set-Bilder), umleiten
  function umleitungEinrichten(links) {
    var ATTRIBUTE = ["src", "href", "data-bild"];
    function attributePruefen(el) {
      ATTRIBUTE.forEach(function (a) {
        var v = el.getAttribute && el.getAttribute(a);
        var l = v && linkFuer(v, links);
        if (l) { el.setAttribute(a, l); }
      });
    }
    function baumPruefen(wurzel) {
      if (wurzel.nodeType !== 1) { return; }
      attributePruefen(wurzel);
      Array.prototype.forEach.call(wurzel.querySelectorAll("[src],[href],[data-bild]"), attributePruefen);
    }
    new MutationObserver(function (aenderungen) {
      aenderungen.forEach(function (a) {
        if (a.type === "attributes") { attributePruefen(a.target); }
        else { Array.prototype.forEach.call(a.addedNodes, baumPruefen); }
      });
    }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ATTRIBUTE });

    var original = window.fetch.bind(window);
    window.fetch = function (eingabe, opt) {
      var l = typeof eingabe === "string" ? linkFuer(eingabe, links) : null;
      return original(l || eingabe, opt);
    };
  }

  var gestartet = false;
  function kursStarten(d, admin) {
    if (gestartet) { return; }
    gestartet = true;
    clearTimeout(pruefTimer);
    window.KURS = tiefErsetzen(d.kurs, d.links || {});
    if (d.stil) {
      var st = document.createElement("style");
      st.id = "kurs-stil";
      st.textContent = d.stil;
      document.head.appendChild(st);
    }
    umleitungEinrichten(d.links || {});
    app.innerHTML = "";
    var sk = document.createElement("script");
    sk.textContent = d.app + "\n//# sourceURL=kurs-app.js";
    document.body.appendChild(sk);
    zeigeFuss(admin);
  }

  /* ---------- Start ---------- */
  function start() {
    clearTimeout(pruefTimer);
    var nutzer = S.nutzer();
    if (!nutzer) { return laufenderVorgang() ? zeigeTelegramWarten() : zeigeAnmeldung(); }

    Promise.all([
      S.rest("profiles?select=status,name&id=eq." + encodeURIComponent(nutzer.id)),
      S.rpc("ist_admin")
    ]).then(function (r) {
      var profil = r[0] && r[0][0];
      var admin = r[1] === true;
      var status = profil ? profil.status : "wartend";
      zeigeFuss(admin);
      if (status === "frei" || admin) {
        return ladeInhalte().then(function (d) {
          schreiben(CACHE_KEY, d);
          kursStarten(d, admin);
        }).catch(function (f) {
          if (f && f.leer) { return zeigeFehler(admin ? "Es sind noch keine Inhalte hochgeladen. Das geht auf der Admin-Seite." : "Die Inhalte werden gerade vorbereitet. Schau bitte später noch einmal vorbei."); }
          var c = lesen(CACHE_KEY);
          if (c) { return kursStarten(c, admin); }
          zeigeFehler("Die Inhalte konnten nicht geladen werden. Bitte prüf dein Internet und versuch es noch einmal.");
        });
      }
      schreiben(CACHE_KEY, null);
      if (status === "wartend") { return zeigeWarten(profil && profil.name); }
      zeigeKeinZugang(status);
    }).catch(function () {
      if (!S.nutzer()) { return zeigeAnmeldung("Bitte melde dich neu an."); }
      var c = lesen(CACHE_KEY);
      if (c) { zeigeFuss(false); return kursStarten(c, false); }
      zeigeFehler("Keine Verbindung. Bitte prüf dein Internet und versuch es noch einmal.");
    });
  }

  start();

  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("service-worker.js").catch(function () {});
    });
  }
})();
