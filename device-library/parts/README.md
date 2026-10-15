# Physical part registry v1

`physical-parts.json` owns physical pin identity, package and footprint revisions, package-local anchors, roles, internal contact connectivity and development provenance. Execution profiles are optional. `scripts/sync_editor_catalog.py` generates the lean `apps/web/src/data/editorParts.json` authoring descriptors, the editor catalog, and the complete execution/development snapshots. The lean descriptors omit manufacturer, datasheet, provenance and simulation data; placing, mounting and rendering a part does not require an engine profile. Numeric definition/package/footprint revisions begin at 1. A pinout or mechanical/electrical meaning change requires a new revision; existing mount bindings identify their exact part and package revisions.

Coordinates are millimeters in a right-handed frame with Y up. Mountable lead tips lie at Y=0; `standoffMm` places the body above that plane. DIP length follows X, pin 1 is at -X/+Z, and numbering proceeds counterclockwise in top view. A 2.54 mm pitch equals the existing breadboard's 0.13 world units: `MM_TO_WORLD = 0.13 / 2.54`. The board is not rescaled. The isolated source is not mountable; its pin anchors locate actual front-panel terminals at Y=20 mm, Z=25 mm.

Physical pins have stable IDs, explicit numbers/names/roles, optional output driver kind and optional logical function mapping. SN74HC08N pin 1 is named `1A` and explicitly maps to legacy logical `A1`; that mapping does not convert old instances. Its 14-pin package includes shared VCC pin 14 and GND pin 7. No pin placement is inferred from gate count or logical input/output ordering.

All entries below can be placed and wired. All except `DC_SUPPLY` declare a breadboard footprint. Fixed packages retain one rigid footprint; discrete lead-forming profiles are declared in `package.footprint.leadForming`. The B3F variant is explicitly formed from its native 6.5 x 4.5 mm pattern to 7.62 x 5.08 mm; it is not a claim that an unformed B3F has a 2.54 mm native pitch. Mechanical mounting remains subject to the solver's contact, occupancy and body collision checks.

| Editor type / exact part | Package / pins | Virtual simulation | Pinout and geometry source |
| --- | --- | --- | --- |
| `SN74HC08N` / TI SN74HC08N | PDIP-14, 2.54 mm pitch, 7.62 mm rows | Power-aware four-gate AND subset; requires explicit VCC/GND and known inputs | [TI SCLS081J](https://www.ti.com/lit/ds/symlink/sn74hc08.pdf), pin table p.3 and N package drawing |
| `LED_LTL307EE` / Lite-On LTL-307EE | 5 mm T-1 3/4, A/K, 2.54 mm pitch | Bounded source/resistor/LED DC path; fixed 2 V forward model, 20 mA model limit | [Lite-On manufacturer datasheet BNS-OD-C131/A4](https://mm.digikey.com/Volume0/opasdata/d220001/medias/docus/1153/LTL-307EE.pdf), package/cathode p.1, electrical characteristics p.3 |
| `RESISTOR_AXIAL` / generic configurable resistor | Legacy MRS25 mechanical identity, A/B, leads formed to 10.16 mm | Existing bounded DC resistance; defaults 330 ohms / 0.25 W / 1%, no thermal/transient model | [Vishay MRS16/MRS25 document 28724](https://www.vishay.com/docs/28724/mrs16m25.pdf), geometry reference only, dimensions p.3 |
| `DC_SUPPLY` / netCIRCUIT DC-SUPPLY-V1 | Virtual isolated bench source, PLUS/MINUS terminals | Ideal isolated DC source, default 5 V; no earth or automatic rail connection | Internal model definition below; no physical manufacturer part is asserted |
| `TOGGLE_SWITCH_200MSP1` / E-Switch 200MSP1T1B1M2QE | Three PCB terminals, native 2.54 mm pitch | Ideal SPDT contact union only | [E-Switch Series 200 manufacturer catalogue](https://mm.digikey.com/Volume0/opasdata/d220001/medias/docus/6463/Series%20200%20Switches.pdf), printed pp.127/129 (PDF pp.1/3) |
| `DIP_SWITCH_A6D4100` / Omron A6D-4100 | Eight terminals, four independent opposite-row contact pairs | Ideal contact union only; independent `position0`..`position3` booleans | [Omron A6D/A6DR](https://omronfs.omron.com/en_US/ecb/products/pdf/en-a6d_a6dr.pdf), dimensions/contact form p.2 |
| `PUSH_BUTTON_B3F1000` / Omron B3F-1000 | Four terminals, explicit lead-forming profile | Permanent 1-2 and 3-4 pairs; `pressed` joins 1-3 | [Omron B3F](https://omronfs.omron.com/en_US/ecb/products/pdf/en-b3f.pdf), numbering and top-view internal connections p.4 |
| `CAPACITOR_CERAMIC` / generic configurable ceramic capacitor | Legacy size-15 mechanical identity, A/B; defaults 100 nF / 50 V | Unsupported; place/wire only | [Vishay K Series document 45171](https://www.vishay.com/docs/45171/kseries.pdf), geometry reference only, lead/body dimensions p.2 |
| `CAPACITOR_ELECTROLYTIC` / generic configurable electrolytic capacitor | Legacy 10 x 12.5 mm mechanical identity, PLUS/MINUS; defaults 47 uF / 25 V | Unsupported; place/wire only | [Nichicon UVR CAT.8100M](https://www.nichicon.com/getmedia/fbce3bfe-2a92-4d81-8c8d-1bee760e082f/e-uvr.pdf), geometry/polarity reference only, pp.1-2 |
| `TRANSISTOR_2N3904` / onsemi 2N3904TA | TO-92 case 135AR, 1=E, 2=B, 3=C | Unsupported; place/wire only | [onsemi 2N3904/D Rev.3](https://www.onsemi.com/download/data-sheet/pdf/2n3904-d.pdf), identification p.1 and leadformed outline |
| `DIODE_1N4148` / Vishay 1N4148-TAP | DO-35, A/K, cathode band | Unsupported nonlinear model; place/wire only | [Vishay 1N4148 document 81857](https://www.vishay.com/docs/81857/1n4148.pdf), DO-35/cathode marking and package dimensions |
| `ZENER_1N4733A` / Vishay 1N4733A-TAP | DO-41, A/K, cathode band | Unsupported Zener model; place/wire only | [Vishay document 85816](https://www.vishay.com/docs/85816/1n4728a.pdf), 1N4733A row and DO-41 drawing |
| `BUZZER_PS1240` / TDK PS1240P02BT | 12.2 x 6.5 mm passive piezo, two terminals | Unsupported AC/acoustic model; place/wire only | [TDK PS-series catalogue](https://product.tdk.com/info/en/catalog/datasheets/piezoelectronic_buzzer_ps_en.pdf), PS1240P02BT p.4 |
| `SEGMENT_SC5611EWA` / Kingbright SC56-11EWA | Ten pins, single digit, common cathodes 3/8 | Unsupported LED-array drive; place/wire only | [Kingbright SC56-11EWA V.1A](https://www.kingbrightusa.com/images/catalog/spec/sc56-11ewa.pdf), package/circuit p.1 |
| `SEGMENT_DC5611EWA` / Kingbright DC56-11EWA | Eighteen pins, two independent segment sets, CC1=14 / CC2=13 | Unsupported LED-array drive; place/wire only | [Kingbright DC56-11EWA V.3A](https://www.kingbrightusa.com/images/catalog/SPEC/DC56-11EWA.pdf), package/circuit p.1 |
| `SEGMENT_CC5612EWA` / Kingbright CC56-12EWA | Twelve pins, shared a..g/DP and CC1=12 / CC2=9 / CC3=8 / CC4=6 | Unsupported multiplex drive; place/wire only | [Kingbright CC56-12EWA V.1A](https://www.kingbrightusa.com/images/catalog/SPEC/CC56-12EWA.pdf), package/circuit p.1 |
| `SN74HC02N` / TI SN74HC02N | Separately declared PDIP-14 NOR pinout; 1=1Y | Unsupported powered NOR model; place/wire only | [TI SCLS076G](https://www.ti.com/lit/ds/symlink/sn74hc02.pdf), pin table p.3 |
| `SN74HC04N` / TI SN74HC04N | Separately declared PDIP-14 inverter pinout; six gates | Unsupported powered inverter model; place/wire only | [TI SCLS078H](https://www.ti.com/lit/ds/symlink/sn74hc04.pdf), pin table p.3 |
| `SN74LS266N` / TI SN74LS266N | PDIP-14, XNOR with open-collector outputs | Unsupported; requires external pull-ups and a suitable open-collector behavior model | [TI SDLS151](https://www.ti.com/lit/ds/symlink/sn74ls266.pdf), pinout/output schematic p.1 |

The dual display's eighteen-pin layout is intentionally different from the quad's twelve-pin multiplex layout. Common pins are real electrical terminals. The single display's internally shared common pins 3 and 8 have an explicit unconditional bond. Its LED segment terminals are never unioned to their common as wires.

For the A6D, canonical pad IDs use top-view perimeter numbering 1..8; actuator numbers 1..4 identify independent poles, and the source drawing does not assert moulded pin-number labels. The E-Switch terminal 2 is common: `state=false` closes 2-3, `state=true` closes 2-1. Switch model support means ideal contact connectivity only, excluding bounce, contact resistance and timing.

## Virtual DC source model v1

`NETCIRCUIT-DC-SUPPLY`, revision 1, is an editor instrument with explicit PLUS/MINUS terminals, a bounded 0..15 V `voltage` property and a `power_on` boolean. Its default is 5 V enabled. MINUS is only the return of that source; it never creates a global earth reference. The model does not imply a particular real supply, current limit, protection circuitry or measurement precision. Its `model:dc-source-v1` source identifier refers to this specification.

## Compatibility and verification

The generated editor catalog contains the 21 legacy definitions followed by 55 physical types, including all 37 requested logic codes and the three preserved HC variants. No implicit conversion adds missing power, ground or wires. Legacy arithmetic and memory abstractions retain no physical part/package identity and cannot mount. Physical instance bindings use the circuit 1.1 contract; migration and runtime mounting validation are implemented at the circuit boundary, not in mesh metadata.

R/C values are configurable design properties. Their legacy definition, package, footprint and pin IDs remain stable so saved mounts and wires retain their identity. `identityKind: configurable-generic` and development `provenance.referencePartNumber` distinguish that compatibility identity from a claim that every edited value is the original manufacturer's SKU. Changing R/C/W/V/tolerance does not change body dimensions or mounting geometry. Resistance, power and tolerance use `resistanceOhms`, `powerWatts`, `tolerancePercent`; capacitance and rating use `capacitanceFarads`, `voltageRatingVolts`.

Regression coverage checks each HC08 pin and its logical mapping, power pins, LED terminals, switch pairs, SPDT common selection, actual display pinouts, unsupported model declarations, palette accessibility, generation provenance, duplicate pins, invalid dimensions, nonplanar mounting pins and output driver kinds. Run `python scripts/sync_editor_catalog.py --check`, `services/api/.venv/Scripts/python.exe -m pytest tests/frontend/test_editor_catalog.py tests/frontend/test_physical_catalog.py`, and the web tests from `apps/web`.

## Logic catalog source verification (15 October 2026)

All 37 requested codes have numbered 14-pin PDIP top-view maps checked against primary manufacturer documents. The independent literal fixtures are in `tests/fixtures/logic-pinouts.json`; tests check every name, output driver, NC and supply pin, along with Schmitt inputs and the CD4013 clock/set/reset/complemented outputs. All three HC definitions and the existing LS266 identity, revisions and pins are retained. New logic parts add no execution model. Search aliases select the explicitly named family; they do not establish electrical interchangeability. The TI archive mirror preserves manufacturer-authored pages for discontinued parts unavailable from current product URLs.

| Requested code | Exact selected variant | Electrical family | Primary pinout source |
| --- | --- | --- | --- |
| `7400` | `SN7400N` | 74 | [SDLS025D](https://www.ti.com/lit/gpn/sn7400), 3 (top view and pin functions), N/PDIP drawing |
| `7401` | `SN7401N` | 74 | [SDLS026](https://www.ti.com/lit/gpn/sn5401), 1 (top view / functional diagram), N/PDIP package drawing |
| `7402` | `SN7402N` | 74 | [SDLS027](https://www.ti.com/lit/gpn/sn74ls02), 1 (top view / functional diagram), N/PDIP package drawing |
| `7403` | `SN7403N` | 74 | [SDLS028](https://www.ti.com/lit/gpn/sn74ls03), 1 (top view / functional diagram), N/PDIP package drawing |
| `7404` | `SN7404N` | 74 | [SDLS029C](https://www.ti.com/lit/gpn/sn7404), 1 (top view / functional diagram), N/PDIP package drawing |
| `7405` | `SN7405N` | 74 | [SDLS030A](https://www.ti.com/lit/gpn/sn7405), 1 (top view / functional diagram), N/PDIP package drawing |
| `7408` | `SN7408N` | 74 | [SDLS033](https://www.ti.com/lit/gpn/sn74ls08), 1 (top view / functional diagram), N/PDIP package drawing |
| `7409` | `SN7409N` | 74 | [SDLS034](https://www.ti.com/lit/gpn/sn74ls09), 1 (top view / functional diagram), N/PDIP package drawing |
| `7410` | `SN7410N` | 74 | [SDLS035A](https://www.ti.com/lit/gpn/sn74ls10), 1 (top view / functional diagram), N/PDIP package drawing |
| `7411` | `SN74LS11N` | 74LS | [SDLS131](https://www.ti.com/lit/gpn/sn74ls11), 1 (top view / functional diagram), N/PDIP package drawing |
| `7412` | `SN7412N` | 74 | [TI 1988 TTL Data Book](https://www.bitsavers.org/components/ti/_dataBooks/1988_TI_Standard_TTL_Logic_Data_Book.pdf), PDF 126 / printed 2-63 |
| `7413` | `SN7413N` | 74 | [TI 1988 TTL Data Book](https://www.bitsavers.org/components/ti/_dataBooks/1988_TI_Standard_TTL_Logic_Data_Book.pdf), PDF 130 / printed 2-67 |
| `7414` | `SN7414N` | 74 | [SDLS049C](https://www.ti.com/lit/gpn/sn7414), 3 (top view and pin functions), N/PDIP drawing |
| `7415` | `SN74LS15N` | 74LS | [TI 1988 TTL Data Book](https://www.bitsavers.org/components/ti/_dataBooks/1988_TI_Standard_TTL_Logic_Data_Book.pdf), PDF 150 / printed 2-87 |
| `7420` | `SN7420N` | 74 | [SDLS079](https://www.ti.com/lit/gpn/sn74ls20), 1 (top view / functional diagram), N/PDIP package drawing |
| `7421` | `SN74LS21N` | 74LS | [SDLS139](https://www.ti.com/lit/gpn/sn74ls21), 1 (top view / functional diagram), N/PDIP package drawing |
| `7427` | `SN7427N` | 74 | [SDLS089](https://www.ti.com/lit/gpn/sn74ls27), 1 (top view / functional diagram), N/PDIP package drawing |
| `7430` | `SN7430N` | 74 | [SDLS099](https://www.ti.com/lit/gpn/sn74ls30), 1 (top view / functional diagram), N/PDIP package drawing |
| `7432` | `SN7432N` | 74 | [SDLS100](https://www.ti.com/lit/gpn/sn7432), 1 (top view / functional diagram), N/PDIP package drawing |
| `7437` | `SN7437N` | 74 | [SDLS101](https://www.ti.com/lit/gpn/sn74ls37), 1 (top view / functional diagram), N/PDIP package drawing |
| `7438` | `SN7438N` | 74 | [SDLS105](https://www.ti.com/lit/gpn/sn7438), 1 (top view / functional diagram), N/PDIP package drawing |
| `7440` | `SN7440N` | 74 | [TI 1988 TTL Data Book](https://www.bitsavers.org/components/ti/_dataBooks/1988_TI_Standard_TTL_Logic_Data_Book.pdf), PDF 224 / printed 2-161 |
| `7486` | `SN7486N` | 74 | [SDLS124](https://www.ti.com/lit/gpn/sn74ls86a), 1 (top view / functional diagram), N/PDIP package drawing |
| `74136` | `SN74LS136N` | 74LS | [SDLS048](https://www.ti.com/lit/gpn/sn74ls136), 1 (top view / functional diagram), N/PDIP package drawing |
| `74266` | `SN74LS266N` | 74LS | [SDLS151](https://www.ti.com/lit/gpn/sn74ls266), 1 (top view / functional diagram), N/PDIP package drawing |
| `CD4001` | `CD4001BE` | CD4000B | [SCHS015C](https://www.ti.com/lit/ds/symlink/cd4001b.pdf), 1 (top view / functional diagram), PDIP package drawing |
| `CD4011` | `CD4011BE` | CD4000B | [SCHS021D](https://www.ti.com/lit/ds/symlink/cd4011b.pdf), 1 (top view / functional diagram), PDIP package drawing |
| `CD4012` | `CD4012BE` | CD4000B | [SCHS021D](https://www.ti.com/lit/ds/symlink/cd4012b.pdf), 1 (top view / functional diagram), PDIP package drawing |
| `CD4013` | `CD4013BE` | CD4000B | [SCHS023E](https://www.ti.com/lit/ds/symlink/cd4013b.pdf), 3 (top view and pin functions), PDIP drawing |
| `CD4030` | `CD4030BE` | CD4000B | [SCHS035C](https://www.ti.com/lit/ds/symlink/cd4030b.pdf), 1 (top view / functional diagram), PDIP package drawing |
| `CD4069` | `CD4069UBE` | CD4000UB | [SCHS054E](https://www.ti.com/lit/ds/symlink/cd4069ub.pdf), 3 (top view and pin functions), PDIP drawing |
| `CD4070` | `CD4070BE` | CD4000B | [SCHS055E](https://www.ti.com/lit/ds/symlink/cd4070b.pdf), 2 (terminal diagram, top view), 1 (orderable PDIP variant), PDIP package drawing |
| `CD4071` | `CD4071BE` | CD4000B | [SCHS056D](https://www.ti.com/lit/ds/symlink/cd4071b.pdf), 1 (top view / functional diagram), PDIP package drawing |
| `CD4072` | `CD4072BE` | CD4000B | [SCHS056D](https://www.ti.com/lit/ds/symlink/cd4072b.pdf), 1 (top view / functional diagram), PDIP package drawing |
| `CD4077` | `CD4077BE` | CD4000B | [SCHS055E](https://www.ti.com/lit/ds/symlink/cd4077b.pdf), 2 (terminal diagram, top view), 1 (orderable PDIP variant), PDIP package drawing |
| `CD4081` | `CD4081BE` | CD4000B | [SCHS057C](https://www.ti.com/lit/ds/symlink/cd4081b.pdf), 1 (top view / functional diagram), PDIP package drawing |
| `CD4093` | `CD4093BE` | CD4000B | [SCHS115D](https://www.ti.com/lit/ds/symlink/cd4093b.pdf), 1 (top view / functional diagram), PDIP package drawing |
