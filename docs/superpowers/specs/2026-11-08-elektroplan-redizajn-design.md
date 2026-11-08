# ElektroPlan: redizajn, točnost, spremanje

Korisnik je odobrio dijelove 1 i 2 te zatražio početak rada bez daljnjih pitanja. Dijelove koji nisu zasebno pregledani (sučelje po koracima, hrvatski, testovi) izvodimo prema odabranim maketama.

## Cilj

Projekt se može napraviti od početka do ispisa bez zapinjanja, nacrt je točan i u mjerilu, sav tekst je na hrvatskom, a nakon ponovnog otvaranja ništa se ne gubi. Bez računa i bez servera.

## Opseg

Jedna prostorija po projektu. Postojeće funkcije ostaju, mijenja se način dolaska do njih. Pristup: postupna preradba postojeće aplikacije (React, Three.js, postojeći motor).

Faze, svaka završava radnom aplikacijom:
1. Točnost i testovi
2. Spremanje i rad bez interneta
3. Novo sučelje

## Faza 1: točnost

- Geometrija u metrima, jedno mjerilo, isti faktor za širinu i visinu; zum nikad ne deformira. Bez razmaka među zidovima. Mjerna traka uvijek vidljiva.
- Kote se pamte na 1 mm. Dimenzije zidova i otvora prikazuju se točno kako su upisane.
- Upisana vrijednost se nikad tiho ne mijenja: neispravan unos ostaje u polju, označi se i objasni. Ograničavanje se ne radi po pritisku tipke.
- Strop: jedan koordinatni sustav koji ne ovisi o zidu s razvodnim ormarom. `x` ide duž `room.length`, `y` duž `room.width`.
- Element izvan plohe crta se na stvarnom mjestu, označen crveno, s popisom u koraku Provjera i gumbom "Premjesti unutar zida". Ništa se ne premješta samo.
- Duljine iz stvarne osi trase. Svaka trasa počinje i završava u središtu elementa; paralelni bužiri su na stvarnom razmaku od 4 cm. Kabeli se prikazuju kao "stvarna trasa" i "za nabavu s rezervom".
- Automatska prilagodba mreže ne mutira stanje i ne postavlja utičnice preko otvora.
- Obrazac otvora dobiva visinu i parapet; postojeći otvori mogu se uređivati.
- Testovi: Vitest za motor, geometriju, validaciju i spremanje.

## Ispis

A4 položeno. Stranica 1: pregled svih ploha. Zatim po stranica za svaki zid i strop s kotama, pa strujni krugovi i troškovnik. Mjerilo: najveće standardno koje stane (1:25, 1:50, 1:100, 1:200, 1:500). Svaka stranica ima zaglavlje (projekt, ploha, mjerilo, datum) i mjernu traku od 5 cm. Napomena prije ispisa: ispisati u 100 %.

## Faza 2: spremanje i PWA

- "Moji projekti": novi, primjer, otvori, preimenuj, kopiraj, izvezi, obriši uz potvrdu. Aplikacija otvara zadnji projekt.
- Automatsko spremanje u IndexedDB uz odgodu; stanja *Spremanje…*, *✓ Spremljeno*, *⚠ Nije spremljeno* (uz ponudu izvoza). Traži se trajna pohrana; odbijanje se prikazuje.
- Jedan projekt uređuje se u jednoj kartici (Web Locks).
- Poništi/ponovi: 50 koraka, ne pamti se između sesija.
- `.elektroplan.json` s verzijom formata; uvoz stvara novi projekt; neispravna datoteka dobiva poruku na hrvatskom. Stari JSON izvozi nisu podržani.
- PWA: radi bez mreže nakon prvog otvaranja, fontovi lokalno, poruka o novoj verziji umjesto samostalnog ponovnog učitavanja.
- Uklanjaju se neiskorištene serverske zavisnosti.

## Faza 3: sučelje

Raspored A (vođeni koraci): gornja traka s projektom, koracima 1 Prostorija, 2 Elementi, 3 Trošila i krugovi, 4 Provjera i ispis, te stanjem spremanja. Lijevo sadržaj koraka, desno svojstva odabranog elementa samo kad je nešto odabrano, dolje stalna traka stanja mreže.

Boje A (Bijeli list): neutralno svijetlo sučelje bez plavosivih tonova, nacrt crno na bijelom. Boja nosi značenje: krugovi (najmanje 4,5:1 na bijelom), magenta `#C2007A` samo za odabir, žuta `#FFD23F` samo za upozorenje, crvena samo za greške. Najmanji tekst 12 px. Elementi u stvarnoj veličini okvira s čitljivim pločicama oznaka.

Dodir: računalo i tablet puno uređivanje s povlačenjem prstom. Mobitel: pregled, dodavanje dodirom, ispravak kota upisom, koraci kao donja navigacija.

Sav vidljiv tekst na hrvatskom, decimalni zarez u prikazu.

Testovi cijelog tijeka u pregledniku (Playwright).
