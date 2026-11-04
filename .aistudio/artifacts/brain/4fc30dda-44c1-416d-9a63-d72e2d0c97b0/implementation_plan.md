# ElektroPlan 3D/2D — Inženjerski CAD sustav za projektiranje električnih instalacija

Sveobuhvatna aplikacija za prostorno i tehničko planiranje električnih instalacija koja spaja **interaktivnu 3D vizualizaciju prostorije (s animiranim rasklapanjem u 2D križni nacrt 4 zida i stropa)**, **drag-and-drop postavljanje elemenata uz automatske kote i ortogonalni snap**, **izračun opterećenja strujnih krugova i usklađenosti broja trošila s utičnicama**, **detaljne sheme spajanja vodiča (L, N, PE) i bužira**, te **automatski troškovnik i ispis nacrta za majstore**.

### User Review & Critical Decisions

> [!IMPORTANT]
> Pregledajte potvrđene tehničke odluke iz prethodnog koraka prije početka izrade aplikacije.

- **Potvrđena odluka 1 — Pravila vođenja trasa kabela i bužira**: Ortogonalno polaganje po standardnim instalacijskim zonama (DIN VDE 0100: vodoravne zone 30 cm od stropa i 30 cm od poda, te okomite linije do svake utičnice, prekidača i razvodne kutije).
- **Potvrđena odluka 2 — Prikaz vodiča (L, N, PE) i spajanja prekidača**: Izravan prikaz vodiča (faza – smeđa/crna, nula – plava, uzemljenje – žuto-zelena) na 2D/3D nacrtu uz interaktivni inspektor sheme spajanja (jednopolni, serijski, izmjenični i križni prekidači te spojnice u razvodnim kutijama).
- **Potvrđena odluka 3 — Dokumentacija i izvoz**: Automatski troškovnik materijala (dužine kabela po presjeku 1.5 mm² / 2.5 mm², promjeri i dužine bužira Ø16/Ø20/Ø25 mm, osigurači B10/B16/C16) te priprema za ispis i izvoz 2D nacrta s kotama za izvođače radova.

---

### 1. Overview & Core Concept

- **Što aplikacija radi**:
  1. **Definiranje gabarita i otvora**: Korisnik unosi točnu dužinu, širinu i visinu prostorije (u metrima/centimetrima) te postavlja vrata i prozore po zidovima (uz definiranje širine, visine, udaljenosti od kuta i visine parapeta).
  2. **3D ↔ 2D Rasklopivi prikaz (4 zida + strop)**: Three.js 3D prikaz prostorije koji se glatko animira ("otklapa" poput kartonske kutije u križni tlocrt) u precizan 2D ortogonalni CAD nacrt svih 4 zidova (Sjever, Istok, Jug, Zapad) i stropa, omogućujući i direktno planiranje na 2D nacrtu sa zumiranjem i kotama.
  3. **Drag & Drop postavljanje s kotama i ortogonalnim poravnanjem (Snap)**: Razvodne kutije, utičnice (jednostruke, dvostruke, trofazne), prekidači (jednopolni, serijski, izmjenični, križni) i rasvjetna tijela postavljaju se povlačenjem na zidove i strop. Sustav u realnom vremenu iscrtava kote udaljenosti od poda, stropa te lijevog i desnog ruba zida, uz magnetno poravnanje (snapping) na postojeće osi drugih elemenata i standardne visine (npr. 30 cm za utičnice, 105 cm za prekidače, 220 cm za razvodne kutije).
  4. **Katalog trošila, provjera opterećenja i praćenje broja utičnica**: Dodavanje aparata (hladnjak, pećnica, indukcijska ploča, klima uređaj, TV, PC radna stanica, perilica, bojler, stupna lampa itd.) s definiranim snagama (W). Sustav automatski:
     - Prati **omjer broja trošila i raspoloživih utičnica** (upozorava ako postoji više trošila nego slobodnih utičnica u prostoriji ili pojedinom krugu).
     - Omogućuje **opcijsko povezivanje (dodjelu)** trošila ili rasvjetnog mjesta konkretnoj utičnici ili prekidaču.
     - Računa ukupnu snagu ($P$ u W), struju ($I = P / 230\text{V}$ u A), provjerava preopterećenje po strujnim krugovima (npr. max 3680 W za 16 A osigurač s kabelom $3\times2.5\text{ mm}^2$ ili 2300 W za 10 A s $3\times1.5\text{ mm}^2$) i predlaže razdvajanje krugova za velika trošila (pećnica, klima).
  5. **Izračun kabela, bužira i vizualizacija vodiča (L, N, PE)**: Svaki strujni krug kreće od glavnog voda / razvodne kutije. Program automatski računa točnu ortogonalnu dužinu kabela (s dodatkom za obradu krajeva u kutijama), određuje potreban promjer bužira (Ø16 mm, Ø20 mm ili Ø25 mm ovisno o broju i presjeku žica) i prikazuje detaljnu shemu spajanja faze (L), nule (N) i uzemljenja (PE) za svaki vod i prekidač.
- **Ciljana publika**: Elektroinstalateri, projektanti interijera, inženjeri i vlasnici nekretnina koji planiraju adaptaciju ili novogradnju.
- **Ključna vrijednost**: Eliminira ručno mjerenje kabela, pogreške s premalim brojem utičnica u odnosu na aparate, preopterećenje osigurača i nejasnoće pri spajanju izmjeničnih/serijskih prekidača na gradilištu.

---

### 2. User Experience & Visual Design

- **Ključni korisnički tokovi**:
  1. **Korak 1: Gabariti, Vrata i Prozori**: U lijevom konfiguracijskom panelu korisnik postavlja dimenzije prostorije (npr. $4.50\text{ m} \times 3.60\text{ m} \times 2.60\text{ m}$) i dodaje vrata/prozore na zidove S, I, J, Z. Otvori odmah postaju zabranjene zone za polaganje kabela (trase ih automatski zaobilaze).
  2. **Korak 2: Prebacivanje 3D Prostorija ↔ 2D Rasklopljeni Nacrt**: Korisnik klizačem ili gumbom otklapa 3D zidove i strop u ravninu (0% = sklopljena 3D soba, 100% = potpuno otvoren 2D nacrt svih 4 zidova i stropa) ili bira fokusirani 2D CAD pogled na pojedini zid/tlocrt.
  3. **Korak 3: Drag & Drop Instalacija i Kote**: Iz alatne trake povlači razvodne kutije, utičnice, prekidače i rasvjetu na zidove ili strop. Tijekom pomicanja prikazuju se dinamičke kote (od poda, od stropa, od bočnih zidova) i plave vodilice poravnanja (snap lines) kada je element u ravnini s drugom utičnicom ili razvodnom kutijom.
  4. **Korak 4: Trošila, Strujni Krugovi i Povezivanje**: Korisnik dodaje aparate iz kataloga (ili unosi vlastite), dodjeljuje ih (po želji) određenim utičnicama, a prekidače rasvjetnim tijelima. Statusna ploča u realnom vremenu prikazuje bilancu: *Broj trošila vs. Broj utičnica* te *Opterećenje po strujnim krugovima (A / W)*.
  5. **Korak 5: Shema ožičenja (L, N, PE), Bužiri i Izvoz**: Korisnik uključuje sloj prikaza pojedinačnih vodiča (L, N, PE) i otvara interaktivnu shemu spajanja odabranog prekidača ili razvodne kutije, te na kraju ispisuje/izvozi 2D nacrt s kotama i kompletan troškovnik.

- **Vizualni identitet i tema**:
  - *Estetski smjer*: **Precision Engineering CAD Blueprint** — spoj profesionalnog arhitektonskog BIM/CAD alata i čistog tehničkog sučelja visokog kontrasta.
  - *Paleta boja*:
    - Dominantna podloga (`--background`): Duboka tehnička tamno-plava/škriljevac (`#0B1120`) za 3D/2D radni prostor s finom milimetarskom mrežom (`#1E293B`), te opcijski svijetli "Paper Blueprint" način za ispis (`#F8FAFC`).
    - Strukturne površine: Paneli alata i inspektora u `#111827` s tankim rubovima `1px solid #1F2937`.
    - Semantičke boje elektroinstalacija (prema IEC 60446 standardu):
      - **Faza (L)**: Smeđa (`#B45309` / `#D97706`) i prekidna/komutirana faza (`#F59E0B`)
      - **Nula (N)**: Električno plava (`#2563EB` / `#3B82F6`)
      - **Zaštitno uzemljenje (PE)**: Žuto-zelena (`#10B981` / `#EAB308` dvobojna oznaka)
      - **Kote i Snap vodilice**: Cijan (`#06B6D4`) za kote od poda/stropa i magenta/jantar za osi poravnanja.
  - *Tipografija i hijerarhija*:
    - Naslovi i navigacija: `Plus Jakarta Sans` (SemiBold/Bold).
    - Tehnički podaci, kote, snage (W), struje (A), presjeci ($\text{mm}^2$) i dužine (m): `JetBrains Mono` s `tabular-nums` za savršeno vertikalno poravnanje u tablicama opterećenja i troškovniku.
  - *Interaktivni feedback*: Trenutni prikaz crvenog upozorenja pri pokušaju postavljanja utičnice preko prozora/vrata, vizualni indikator opterećenja osigurača (zeleno < 80%, žuto 80–100%, crveno > 100% nazivne struje) i glatka 3D interpolacija otklapanja zidova.

---

### 3. Key Product Decisions & Trade-Offs

- **Odluka 1: Sinkronizirani 3D rasklopivi model i 2D CAD tlocrt s elevacijama zidova**
  - *Odabrani pristup*: Koristimo jedinstveni prostorni model u kojem svaka ploha (Sjeverni zid, Istočni zid, Južni zid, Zapadni zid, Strop) ima lokalni 2D koordinatni sustav $(u, v)$ u metrima. U 3D prikazu zidovi se pomoću zglobnih transformacija (hinge pivot) mogu glatko rasklopiti iz zatvorene sobe (90°) u ravni 2D križni raspored (0°), dok je za precizan drag-and-drop s kotama dostupan i oštar 2D ortogonalni CAD prikaz (križni rasklop svih ploha ili povećani prikaz aktivnog zida).
  - *Zašto*: 3D rasklop daje trenutnu prostornu orijentaciju (gdje se zidovi spajaju i kuda bužir prelazi sa zida na zid ili strop), dok 2D ortogonalni prikaz omogućuje kirurški precizno postavljanje utičnica, čitanje kota od poda/stropa i čist ispis nacrta za majstore.
- **Odluka 2: Automatski ortogonalni izračun trasa po instalacijskim zonama i dimenzioniranje bužira**
  - *Odabrani pristup*: Algoritam vodi glavnu trasu iz razvodne kutije kroz gornju instalacijsku zonu (30 cm ispod stropa ili kroz strop za rasvjetu) te se spušta ili podiže strogo pod kutom od 90° do svake utičnice i prekidača. Ako se na putu nalaze vrata ili prozor, algoritam automatski preusmjerava trasu iznad ili ispod otvora. Promjer bužira računa se prema broju vodiča i presjeku (npr. 3 vodiča $1.5\text{ mm}^2 \rightarrow \varnothing 16\text{ mm}$; 3 vodiča $2.5\text{ mm}^2$ ili 5 vodiča $1.5\text{ mm}^2 \rightarrow \varnothing 20\text{ mm}$; glavni vodovi ili više kabela $\rightarrow \varnothing 25\text{ mm}$).
  - *Zašto*: Poštuje građevinske propise (bušenje zida smije biti sigurno izvan vertikalnih i horizontalnih zona oko utičnica) i daje realnu dužinu kabela i bužira.
- **Odluka 3: Fleksibilno povezivanje trošila i stroga kontrola bilance utičnica**
  - *Odabrani pristup*: Svaka dvostruka utičnica broji se kao 2 priključna mjesta, a jednostruka kao 1. Korisnik može dodati trošila u prostoriju bez obaveznog vezanja uz konkretnu utičnicu (za brzu provjeru opterećenja i potrebnog broja utičnica) ili ih jednim klikom vezati za točno određenu utičnicu na zidu (čime ta utičnica preuzima snagu uređaja i strujni krug automatski prilagođava presjek kabela i osigurač).
  - *Zašto*: Izravno ispunjava zahtjev da se broj trošila prati u odnosu na broj utičnica, a da dodjela uređaja utičnici/prekidaču bude moguća, ali ne i prisilna.

---

### 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Arhitektura sustava i hijerarhija komponenti**:

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                        GLAVNI SPREMNIK STANJA PROJEKTA (React State)                │
│  • RoomDimensions (dužina, širina, visina) + Openings[] (vrata, prozori po zidu)    │
│  • ElectricalNodes[] (razvodne kutije, utičnice, prekidači, rasvjeta + x,y kote)   │
│  • Appliances[] (trošila u W, opcijska veza na utičnicu, preporučeni krug)          │
│  • Circuits[] (strujni krugovi: osigurač 10A/16A, presjek 1.5/2.5mm², boja)         │
└───────────────┬───────────────────────────────────┬─────────────────────────────────┘
                │                                   │
                ▼                                   ▼
┌───────────────────────────────────────────┐ ┌───────────────────────────────────────┐
│   PROSTORNI 3D / 2D CAD POGLEDI           │ │   INŽENJERSKI MOTOR I ANALITIKA       │
│                                           │ │                                       │
│ ┌───────────────────────────────────────┐ │ │ ┌───────────────────────────────────┐ │
│ │ Three.js 3D Scena s Rasklapanjem      │ │ │ │ Ortogonalni Router & Bužir Engine │ │
│ │ • 4 zida + strop (hinge animacija)    │ │ │ │ • Izračun X/Y/Z trasa i zaobila-  │ │
│ │ • 3D prikaz kutija, bužira i kabela   │ │ │ │   ženje prozora i vrata           │ │
│ └───────────────────────────────────────┘ │ │ │ • Izračun dužine (L,N,PE) i Ø mm  │ │
│ ┌───────────────────────────────────────┐ │ │ └───────────────────────────────────┘ │
│ │ Interaktivni 2D Rasklopljeni Nacrt    │ │ │ ┌───────────────────────────────────┐ │
│ │ • Križni tlocrt (4 zida + strop)      │ │ │ │ Analizator Opterećenja i Trošila  │ │
│ │ • Drag & Drop s kotama (pod/strop)    │ │ │ │ • Provjera: Broj trošila ≤ Utičn. │ │
│ │ • Snap-to-axis vodilice poravnanja    │ │ │ │ • Izračun P(W), I(A) po krugovima │ │
│ │ • Višebojni prikaz žica (L, N, PE)    │ │ │ └───────────────────────────────────┘ │
│ └───────────────────────────────────────┘ │ │ ┌───────────────────────────────────┐ │
└───────────────────────────────────────────┘ │ │ Generator Shema Spajanja & BOM-a  │ │
                                              │ │ • Sheme: Jednopolni/Izmjenični/   │ │
                                              │ │   Serijski/Križni + Razvodna kut. │ │
                                              │ │ • Ispis 2D nacrta + Troškovnik    │ │
                                              │ └───────────────────────────────────┘ │
                                              └───────────────────────────────────────┘
```

- **Model podataka i glavne cjeline**:
  - `RoomConfig`: `{ length: number, width: number, height: number, wallThickness: number }`
  - `WallOpening`: `{ id, wall: 'north' | 'east' | 'south' | 'west', type: 'door' | 'window', offsetFromLeft: number, width: number, height: number, sillHeight: number }`
  - `ElectricalElement`: `{ id, surface: 'north' | 'east' | 'south' | 'west' | 'ceiling', category: 'junction_box' | 'socket_single' | 'socket_double' | 'socket_shuko_3p' | 'switch_single' | 'switch_double' | 'switch_two_way' | 'switch_cross' | 'light_ceiling' | 'light_wall', x: number, y: number, circuitId: string, controlledTargetIds?: string[], label: string }`
  - `ApplianceItem`: `{ id, name: string, category: string, powerWatts: number, requiresDedicatedCircuit: boolean, assignedSocketId?: string, circuitId?: string }`
  - `ElectricalCircuit`: `{ id, name: string, code: string, breakerAmps: 10 | 16 | 20, cableCrossSection: 1.5 | 2.5 | 4.0, mainJunctionBoxId: string }`
  - `CableSegment`: `{ id, circuitId, surface, points: {x, y}[], lengthMeters: number, conduitDiameterMm: 16 | 20 | 25, conductors: ('L' | 'L_switched' | 'L_traveler1' | 'L_traveler2' | 'N' | 'PE')[] }`

- **Mapiranje interakcija i stanja**:
  - **Povlačenje (Drag & Drop) na zid/strop**: Preračunava koordinate miša u metre na aktivnom zidu/stropu, provjerava udaljenost do ostalih elemenata na istom zidu (ako je $|\Delta x| < 0.05\text{ m}$ ili $|\Delta y| < 0.05\text{ m}$, aktivira `snap` na istu vertikalu ili horizontalu), prikazuje dinamičke kote `y` (od poda) i `height - y` (od stropa) te sprječava ispuštanje unutar gabarita prozora ili vrata.
  - **Dodavanje trošila i provjera utičnica**: Svaka promjena u listi `Appliances[]` ili `ElectricalNodes[]` preračunava `totalSocketsAvailable` (zbroj utičničnih mjesta) i `totalAppliancesCount`. Ako je broj trošila veći od broja utičnica, u gornjoj inženjerskoj traci i panelu trošila prikazuje se precizno upozorenje koliko još utičnica nedostaje.
  - **Inspektor sheme spajanja (Wiring Schematic Viewer)**: Klikom na bilo koji prekidač, rasvjetu ili razvodnu kutiju otvara se interaktivni dijagram koji točno crta kako dolaze i odlaze vodiči **Faza (L)**, **Prekidna/Komutirana faza ($L^\prime$)**, **Korespondenti (kod izmjeničnog/križnog spoja)**, **Nula (N)** i **Uzemljenje (PE)** kroz odgovarajući bužir.
  - **Ispis nacrta i troškovnika**: Poseban prikaz za ispis (`window.print()` / izvoz) generira čist crno-bijeli ili kolor tehnički list s 2D rasklopljenim nacrtom svih zidova i stropa, svim kotama od poda/stropa, legendom simbola i tablicom materijala (ukupno metara kabela po tipu, bužira po promjeru, broj kutija, prekidača, utičnica i osigurača).
