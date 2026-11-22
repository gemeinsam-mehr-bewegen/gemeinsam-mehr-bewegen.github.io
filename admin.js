/* Admin-Seite: Freigaben verwalten und Inhalte aus dem Entwurf hochladen. */
(function () {
  "use strict";
  var S = window.SB;
  var app = document.getElementById("app");
  var personen = [];
  var suche = "";

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }
  function datum(iso) {
    if (!iso) { return ""; }
    var d = new Date(iso);
    return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) + ", " + d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  }

  // Nur für Tests auf dem eigenen Rechner
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) { window.__hochladenTest = function (d) { return hochladen(d); }; }

  /* ---------- Start ---------- */
  if (!S.nutzer()) {
    app.innerHTML = '<header class="h-kopf"><h1>Admin</h1><p>Bitte melde dich zuerst in der <a class="h-link" href="./">App</a> an.</p></header>';
    return;
  }
  S.rpc("ist_admin").then(function (ja) {
    if (ja !== true) {
      app.innerHTML = '<header class="h-kopf"><h1>Admin</h1><p>Diese Seite ist nur für Admins.</p></header>';
      return;
    }
    geruestZeigen();
    personenLaden();
    adminsLaden();
  }).catch(function () {
    app.innerHTML = '<header class="h-kopf"><h1>Admin</h1><p>Keine Verbindung. Bitte lade die Seite neu.</p></header>';
  });

  function geruestZeigen() {
    app.innerHTML =
      '<header class="h-kopf"><p class="h-vorzeile">Admin</p><h1>Zugänge und Inhalte</h1></header>' +
      '<label class="h-feld h-suche"><span>Suchen</span><input id="suche" type="search" placeholder="Name oder E-Mail"></label>' +
      '<section class="h-karte" id="liste-wartend"></section>' +
      '<section class="h-karte" id="liste-frei"></section>' +
      '<section class="h-karte" id="liste-aus"></section>' +
      '<section class="h-karte" id="hochladen">' +
        '<h2>Inhalte hochladen</h2>' +
        '<p>Wähle den Ordner <strong>entwurf</strong> aus. Hochgeladen werden alle fertigen Lektionen mit ihren Bildern und PDFs. Was „In Arbeit“ ist, bleibt draußen und erscheint im Team nur als „Folgt in Kürze“.</p>' +
        '<label class="h-feld h-datei"><span>Ordner „entwurf“</span><input id="ordner" type="file" webkitdirectory directory multiple></label>' +
        '<button class="h-knopf" type="button" id="los" disabled>Jetzt hochladen</button>' +
        '<p class="h-meldung" id="hoch-meldung"></p>' +
        '<div class="h-protokoll" id="protokoll"></div>' +
      '</section>' +
      '<section class="h-karte" id="admins"><h2>Admins</h2><p class="h-leise">Wird geladen …</p></section>';
    document.getElementById("suche").addEventListener("input", function () { suche = this.value.trim().toLowerCase(); listenZeigen(); });
    hochladenEinrichten();
  }

  /* ---------- Freigaben ---------- */
  function personenLaden() {
    return S.rest("profiles?select=id,name,telegram_name,status,erstellt_am,entschieden_am,entschieden_von&order=erstellt_am.desc").then(function (p) {
      personen = p || [];
      listenZeigen();
    });
  }

  function personZeile(p) {
    var knoepfe = {
      wartend: [["frei", "Freigeben", ""], ["abgelehnt", "Ablehnen", "rot"]],
      frei: [["gesperrt", "Zugang entziehen", "rot"]],
      abgelehnt: [["frei", "Doch freigeben", ""]],
      gesperrt: [["frei", "Wieder freigeben", ""]]
    }[p.status] || [];
    var info = (p.telegram_name ? "@" + esc(p.telegram_name) + " · " : "") + "angemeldet " + datum(p.erstellt_am) +
      (p.entschieden_am ? " · " + ({ frei: "freigegeben", abgelehnt: "abgelehnt", gesperrt: "gesperrt", wartend: "zurückgesetzt" }[p.status] || "") + " " + datum(p.entschieden_am) + (p.entschieden_von ? " von " + esc(p.entschieden_von) : "") : "");
    return '<div class="h-person"><div><div class="h-person-name">' + esc(p.name || "(ohne Namen)") + '</div><div class="h-person-info">' + info + '</div></div>' +
      '<div class="h-person-knoepfe">' + knoepfe.map(function (k) {
        return '<button class="h-knopf klein ' + k[2] + '" type="button" data-id="' + esc(p.id) + '" data-status="' + k[0] + '" data-name="' + esc(p.name || p.telegram_name || "diese Person") + '">' + k[1] + '</button>';
      }).join("") + '</div></div>';
  }

  function listenZeigen() {
    var gefiltert = personen.filter(function (p) {
      return !suche || (p.name || "").toLowerCase().indexOf(suche) >= 0 || (p.telegram_name || "").toLowerCase().indexOf(suche) >= 0;
    });
    function block(id, titel, filter, leer) {
      var l = gefiltert.filter(filter);
      document.getElementById(id).innerHTML = '<h2>' + titel + '<span class="h-zahl">' + l.length + '</span></h2>' +
        (l.length ? l.map(personZeile).join("") : '<p class="h-leise">' + leer + '</p>');
    }
    block("liste-wartend", "Wartet auf Freigabe", function (p) { return p.status === "wartend"; }, "Niemand wartet gerade.");
    block("liste-frei", "Freigegeben", function (p) { return p.status === "frei"; }, "Noch niemand freigegeben.");
    block("liste-aus", "Abgelehnt oder gesperrt", function (p) { return p.status === "abgelehnt" || p.status === "gesperrt"; }, "Niemand.");
    Array.prototype.forEach.call(app.querySelectorAll("button[data-status]"), function (b) {
      b.addEventListener("click", function () {
        var st = b.getAttribute("data-status"), name = b.getAttribute("data-name");
        var frage = { frei: name + " freigeben? " + name + " bekommt dann eine Nachricht in Telegram.", abgelehnt: name + " ablehnen?", gesperrt: "Zugang von " + name + " entziehen? Neue Inhalte sind dann nicht mehr abrufbar." }[st];
        if (!window.confirm(frage)) { return; }
        b.disabled = true;
        // über die Server-Funktion, damit Telegram-Nachrichten mitgehen; ohne Funktion direkt in der Datenbank
        S.funktion("telegram", { aktion: "zugang", id: b.getAttribute("data-id"), status: st })
          .then(function (d) { if (!d || !d.ok) { throw new Error("nicht ok"); } })
          .catch(function () { return S.rpc("zugang_setzen", { p_id: b.getAttribute("data-id"), p_status: st }); })
          .then(personenLaden)
          .catch(function () { b.disabled = false; window.alert("Das hat nicht geklappt. Bitte versuch es noch einmal."); });
      });
    });
  }

  function adminsLaden() {
    S.rest("admins?select=name,user_id&order=erstellt_am").then(function (a) {
      document.getElementById("admins").innerHTML = '<h2>Admins<span class="h-zahl">' + a.length + '</span></h2>' +
        a.map(function (x) { return '<div class="h-person"><div class="h-person-name">' + esc(x.name) + '</div><div class="h-person-info">' + (x.user_id ? "in der App angemeldet" : "noch nicht in der App angemeldet") + '</div></div>'; }).join("") +
        '<p class="h-leise">Bis zu vier Admins sind möglich. Einen weiteren Admin trägt Claude mit dir zusammen ein.</p>';
    }).catch(function () {});
  }

  /* ---------- Inhalte hochladen ---------- */
  var gewaehlt = null;

  function protokoll(text) {
    var p = document.getElementById("protokoll");
    p.textContent += text + "\n";
    p.scrollTop = p.scrollHeight;
  }

  // Gleiche Regel wie in der Kurs-App: Dateiname des fertigen PDFs aus dem Lektionstitel
  function pdfName(t) {
    return t.replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue")
      .replace(/ß/g, "ss").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") + ".pdf";
  }

  // Fassung fürs Team: Was in Arbeit ist, wird zur leeren Zeile „Folgt in Kürze“ (nur Titel, kein Inhalt)
  function teamFassung(kurs) {
    var k = JSON.parse(JSON.stringify(kurs));
    var weg = 0;
    function stummel(l) { weg++; var s = { id: l.id, titel: l.titel, inArbeit: true }; if (l.nurWerkzeug) { s.nurWerkzeug = true; } return s; }
    k.module = (k.module || []).map(function (m) {
      if (m.inArbeit) {
        return { id: m.id, titel: m.titel, kurzbeschreibung: m.kurzbeschreibung, inArbeit: true, lektionen: (m.lektionen || []).map(stummel) };
      }
      m.lektionen = (m.lektionen || []).map(function (l) { return l.inArbeit ? stummel(l) : l; });
      return m;
    });
    ["einleitung", "willkommen"].forEach(function (f) { if (k[f] && k[f].inArbeit) { delete k[f]; } });
    return { kurs: k, ausgelassen: weg };
  }

  function sichtbareTitel(kurs) {
    var t = [];
    kurs.module.forEach(function (m) { if (!m.inArbeit) { m.lektionen.forEach(function (l) { if (!l.inArbeit && l.titel) { t.push(l.titel); } }); } });
    return t;
  }

  function hochladenEinrichten() {
    var feld = document.getElementById("ordner"), los = document.getElementById("los"), m = document.getElementById("hoch-meldung");
    feld.addEventListener("change", function () {
      document.getElementById("protokoll").textContent = "";
      gewaehlt = null; los.disabled = true; m.className = "h-meldung"; m.textContent = "";
      var dateien = {};
      Array.prototype.forEach.call(feld.files, function (f) {
        var teile = (f.webkitRelativePath || f.name).split("/");
        teile.shift(); // Ordnername „entwurf“ weglassen
        var pfad = teile.join("/");
        if (!pfad || /(^|\/)\./.test(pfad) || /^vorschau\//.test(pfad)) { return; }
        dateien[pfad] = f;
      });
      if (!dateien["inhalte.js"] || !dateien["app.js"] || !dateien["style.css"]) {
        m.textContent = "In diesem Ordner fehlen inhalte.js, app.js oder style.css. Bitte wähle den Ordner „entwurf“.";
        return;
      }
      gewaehlt = dateien;
      los.disabled = false;
      m.className = "h-meldung gut";
      m.textContent = "Ordner erkannt (" + Object.keys(dateien).length + " Dateien). Jetzt auf „Jetzt hochladen“ tippen.";
    });
    los.addEventListener("click", function () {
      if (!gewaehlt) { return; }
      los.disabled = true; feld.disabled = true;
      m.className = "h-meldung"; m.textContent = "Wird hochgeladen, bitte die Seite offen lassen …";
      hochladen(gewaehlt).then(function (zusammenfassung) {
        m.className = "h-meldung gut"; m.textContent = "Fertig. " + zusammenfassung;
      }).catch(function (f) {
        m.className = "h-meldung"; m.textContent = "Abgebrochen: " + (f && f.message ? f.message : "unbekannter Fehler") + ". Es ist nichts kaputtgegangen, du kannst es noch einmal versuchen.";
        protokoll("FEHLER: " + (f && f.message));
      }).then(function () { feld.disabled = false; los.disabled = false; });
    });
  }

  function hochladen(d) {
    var kurs, app, stil, version = "";
    return Promise.all([d["inhalte.js"].text(), d["app.js"].text(), d["style.css"].text(), d["service-worker.js"] ? d["service-worker.js"].text() : Promise.resolve("")])
      .then(function (t) {
        var fenster = {};
        try { new Function("window", t[0])(fenster); } catch (e) { throw new Error("inhalte.js enthält einen Fehler (" + e.message + ")"); }
        if (!fenster.KURS || !fenster.KURS.module) { throw new Error("inhalte.js enthält keinen Kurs"); }
        var tf = teamFassung(fenster.KURS);
        kurs = tf.kurs; app = t[1]; stil = t[2];
        var v = /VERSION\s*=\s*"([^"]+)"/.exec(t[3]); version = v ? v[1] : new Date().toISOString().slice(0, 16);
        protokoll("Stand " + version + " · " + tf.ausgelassen + " Lektionen in Arbeit bleiben draußen");

        // Nur Dateien hochladen, die die fertigen Inhalte wirklich brauchen
        var text = JSON.stringify(kurs).replace(/"\.\//g, '"');
        var vorsilben = [];
        (app.match(/["'](bilder|spickzettel)\/[A-Za-z0-9_-]*/g) || []).forEach(function (s) { vorsilben.push(s.slice(1)); });
        var pdfs = {};
        sichtbareTitel(kurs).forEach(function (t2) { pdfs["pdf/" + pdfName(t2)] = true; });
        var noetig = Object.keys(d).filter(function (p) {
          if (!/^(bilder|pdf|spickzettel)\//.test(p)) { return false; }
          if (text.indexOf('"' + p + '"') >= 0) { return true; }
          if (pdfs[p]) { return true; }
          return vorsilben.some(function (v2) { return p.indexOf(v2) === 0; });
        });
        protokoll(noetig.length + " Dateien werden hochgeladen");

        // nacheinander hochladen, damit es auch bei schwachem Netz klappt
        var kette = Promise.resolve(), nr = 0;
        noetig.forEach(function (p) {
          kette = kette.then(function () {
            nr++;
            return S.dateiHochladen(p, d[p]).then(function () { protokoll("✓ " + nr + "/" + noetig.length + " " + p); });
          });
        });
        return kette.then(function () { return noetig; });
      })
      .then(function (noetig) {
        var jetzt = new Date().toISOString();
        return S.rest("inhalte", {
          body: [
            { schluessel: "kurs", daten: kurs, version: version, aktualisiert_am: jetzt },
            { schluessel: "app", daten: { code: app }, version: version, aktualisiert_am: jetzt },
            { schluessel: "stil", daten: { code: stil }, version: version, aktualisiert_am: jetzt },
            { schluessel: "dateien", daten: noetig, version: version, aktualisiert_am: jetzt }
          ],
          kopf: { Prefer: "resolution=merge-duplicates,return=minimal" }
        }).then(function () { protokoll("✓ Texte, Kurs-Technik und Aussehen gespeichert"); return noetig; });
      })
      .then(function (noetig) {
        // Dateien, die nicht mehr gebraucht werden, aus dem Speicher entfernen
        var behalten = {};
        noetig.forEach(function (p) { behalten[p] = true; });
        return Promise.all(["bilder", "pdf", "spickzettel"].map(function (o) {
          return S.dateienAuflisten(o + "/").then(function (liste) {
            return (liste || []).filter(function (e) { return e.id; }).map(function (e) { return o + "/" + e.name; });
          }).catch(function () { return []; });
        })).then(function (gruppen) {
          var alt = [].concat.apply([], gruppen).filter(function (p) { return !behalten[p]; });
          if (!alt.length) { return noetig; }
          return S.dateienLoeschen(alt).then(function () { protokoll("✓ " + alt.length + " alte Dateien entfernt"); return noetig; });
        });
      })
      .then(function (noetig) {
        var lektionen = sichtbareTitel(kurs).length;
        return "Stand " + version + ": " + lektionen + " Lektionen und " + noetig.length + " Dateien sind jetzt für freigegebene Personen sichtbar.";
      });
  }
})();
