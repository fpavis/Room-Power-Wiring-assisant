# Pravila struke u ElektroPlanu

Pregled pravila koja aplikacija provodi. Aplikacija je pomoć pri planiranju i ne zamjenjuje projekt ni provjeru ovlaštenog električara. Izvore pod "provjeriti" treba usporediti s važećim tekstom norme.

## Što aplikacija provodi

| Pravilo | Vrijednost | Gdje | Izvor |
|---|---|---|---|
| Vodoravne trase u gornjoj zoni | 15 do 45 cm ispod stropa | `routing.ts` | DIN 18015-3, sekundarni izvori |
| Silazak do elementa | okomito, pod pravim kutom | `routing.ts` | DIN 18015-3 |
| Kutije u gornjoj zoni | napomena izvan zone | `rules.ts` | DIN 18015-3 |
| Razmak otvora od kuta i susjeda | zaključavanje na 15 cm | `openingDrag.ts` | DIN 18015-3, Vorzugsmaß |
| Pad napona | 3 % rasvjeta, 5 % ostalo | `rules.ts` | IEC 60364-5-52, tablica G.52.1 |
| FID 30 mA | u troškovniku uvijek | `electricalEngine.ts` | HD 60364-4-41 |
| Boje vodiča | L smeđa, crna, siva; N plava; PE žuto-zelena | `presets.ts` | HD 308 S2 / IEC 60445 |
| Faza se prekida, nula ne | sheme | `WiringSchematicModal.tsx` | opća praksa |
| Zaseban krug za veća trošila | upozorenje | `electricalEngine.ts` | DIN 18015-2, sekundarni izvori |
| Šuko utičnica najviše 16 A | upozorenje i smanjenje osigurača | `rules.ts`, `projectOps.ts` | nazivna struja utičnice |
| Jače jednofazno trošilo | fiksni priključak, 20 A, 4 mm² | `projectOps.ts` | uobičajena praksa, provjeriti prema načinu polaganja |
| Rasvjeta odvojena od utičnica | preporuka i razdvajanje | `rules.ts`, `projectOps.ts` | uobičajena praksa |

## Broj žila

| Spoj | Vodiči | Kabel |
|---|---|---|
| Jednopolni prekidač | L, L', PE | 3×1,5 |
| Serijski prekidač | L, L1', L2', PE | 4×1,5 |
| Izmjenični prekidač | L ili L', K1, K2, PE | 4×1,5 |
| Križni prekidač | K1, K2, K1, K2, PE | 5×1,5 |
| Rasvjetno mjesto | L', N, PE | 3×1,5 |
| Utičnica 16 A | L, N, PE | 3×2,5 |
| Trofazni priključak | L1, L2, L3, N, PE | 5×2,5 |

## Provjeriti u važećoj normi

- Presjeci 1,5 mm² za 10 A i 2,5 mm² za 16 A uobičajena su praksa. Pretraživanjem nisu potvrđeni iz teksta norme, a stvarno ovise o načinu polaganja (HRN HD 60364-5-52).
- Kote zona uzete su iz sekundarnih izvora za DIN 18015-3:2007. Za izdanje 2016 tekst norme nije bio dostupan.
- DIN norme nisu obvezne u Hrvatskoj. Obvezuje Tehnički propis za niskonaponske električne instalacije (NN 5/2010) i norme na koje upućuje.

## Još nije modelirano

Zone kupaonice (HD 60364-7-701), izjednačenje potencijala, selektivnost zaštite, korekcijski faktori za grupiranje vodova i ispitivanje izvedene instalacije.

## Izvori

- [Baunetzwissen: Leitungsverlegung und Installationszonen](https://www.baunetzwissen.de/elektro/fachwissen/leitungen-verteiler/leitungsverlegung-und-installationszonen-153012)
- [de: Installationszonen, DE 21/07](https://elektro.net/file/show/80402/e0567a/DE_21_07_EI42.pdf)
- [Tehnički propis za niskonaponske električne instalacije, NN 5/2010](https://narodne-novine.nn.hr/clanci/sluzbeni/2010_01_5_132.html)
- [HD 60364-4-41:2017](https://standards.iteh.ai/catalog/standards/clc/ba30ce0f-1ce1-49e3-8ba2-18cfe4714b8c/hd-60364-4-41-2017)
- [Electrical Installation Guide: Maximum voltage drop](https://www.electrical-installation.org/enwiki/Maximum_voltage_drop)
- [Hager: DIN 18015](https://hager.com/de/wissen/normen/din-18015)
