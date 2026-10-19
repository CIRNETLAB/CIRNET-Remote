# Kiểm chứng package 3D kín chỗ ra chân — 2026-10-18

> Historical evidence status — 2026-10-19 audit: command outputs, Git state and local artifact locations below describe the original session. They do not report this audit’s results or authorize new output under `.build`, `.superpowers`, `.test-build` or `docs/verification`. For reruns use [VERIFICATION.md](../VERIFICATION.md); generated visual and raw diagnostic artifacts must start outside the repository. Existing outputs await separate owner review and have not been deleted or moved.

Phạm vi: tám family trong `PROMPT_CODEX_Model_3D_Dung_Kich_Thuoc_Kin_Chan_netCircuit.md`; đối chiếu thay đổi chưa commit với HEAD `be44651`. Tài liệu ghi các phép đo mesh thật, kiểm tra solid/collision, bảo toàn descriptor và gate tích hợp đã thực chạy.

## Nguồn hình học và bảo toàn dữ liệu

Catalog khai báo `PackageShapeV1`, gồm family, exits theo body-local, normal, tiết diện và embed 0.15 mm. Part/package ID cùng revision phân biệt preset mới với descriptor cũ. `MM_TO_WORLD = 0.13 / 2.54` giữ nguyên.

`electrical/rigidPackageLeads.ts` là nguồn chung cho feedthrough, đường line/arc của chân fixed và stations của DIP/TO-92. Renderer lấy cùng định nghĩa, thêm đoạn ẩn 0.15 mm; validator chỉ nhận phần ngoài. `PackageFeedthrough.ts`, `LeadGeometry.ts`, `StampedLeadGeometry.ts` phục vụ fixed/flexible/preview/thumbnail qua pipeline package hiện hữu. Python đối chiếu định nghĩa ngoài bằng `contracts/rigid_leads.py` và fixture `rigid-leads-parity.json`; bán kính capsule bao cả góc tiết diện và vai chân rộng.

Đã so sánh mọi entry hiện hành và historical tại HEAD theo cả bốn khóa part ID/revision và package ID/revision: không thiếu entry, không thay nội dung descriptor cũ. Re-anchor giữ descriptor đang chọn; chỉ explicit rebuild nhận preset hiện hành. Không suy pinout, rating hay danh tính điện từ mesh.

Catalog hiện có 40 IC DIP, đều là DIP14; tất cả dùng shape mới với package `PDIP-14-300` revision 2. Các test DIP16/20 dùng descriptor tổng hợp có kích thước/số chân riêng để chứng minh builder không hard-code 14 chân; chúng không bổ sung IC16/20 được hỗ trợ vào catalog.

Theo yêu cầu bổ sung cuối cùng của người dùng, resistor hiện hành có **L=4.90 mm, D=1.75 mm**; wire0.50 mm và standoff0.80 mm giữ nguyên. Đây là lựa chọn hình học generic của người dùng, không phải envelope tối đa MRS16 trong prompt ban đầu. Các descriptor đã xuất hiện trong ứng dụng ở những bước chỉnh trước — R36 revision3, R39 revision4 và R43 revision5 — cùng profile gốc đều được giữ trong history. Linh kiện mới dùng R49 revision6; linh kiện đã pin descriptor cũ chỉ đổi preset khi explicit rebuild.

## Kích thước đo trên mesh

Đo position attributes của `BufferGeometry` sau `Mesh.matrixWorld`, lấy `Box3` trong package frame và chia `MM_TO_WORLD`; không đọc lại kích thước catalog để thay cho số đo. Bảng là bounds **thân**, theo X/Y/Z, đơn vị mm.

| Family | X đo được | Y đo được | Z đo được |
|---|---:|---:|---:|
| Resistor | 4.9000001091 | 1.7500000390 | 1.7500000390 |
| Diode epoxy | 4.49999989 | 2.30000001 | 2.30000001 |
| Zener glass | 3.50000008 | 1.59999999 | 1.59999999 |
| Ceramic | 4.99999994 | 4.99999994 | 2.20000003 |
| Electrolytic | 6.30000014 | 11.00000058 | 6.30000014 |
| LED | 5.79999980 | 8.70000028 | 5.79999980 |
| DIP14 | 19.00000026 | 3.03999996 | 6.34999977 |
| TO-92 | 4.60000002 | 5.09999978 | 3.90000000 |

Tất cả khớp preset trong tolerance `1e-4 mm`; sai số thân lớn nhất quan sát được dưới `6e-7 mm`, phù hợp lượng tử hóa Float32. Chọn ring để đo tiết diện với tolerance `1e-5 mm`.

- LED: lens Ø4.99999994; flange Ø5.79999980; flange H1.000000105; dome rise2.490000134 mm. Chiều cao tổng vỏ8.70000028 mm đã gồm dome. Flange H đo từ đáy thật đến ring cao nhất có bán kính lớn hơn2.501 mm; dome rise đo từ ring cuối cùng có bán kính2.5 mm đến đỉnh.
- DIP14: đáy thân1.00000000; dày vỏ3.03999996; đỉnh thân cách contact plane4.03999996 mm. Row span7.62000002; pitch dọc hàng2.54000020 mm. Vai rộng1.39999945 × dày0.27999998 mm tại exit ring; tail rộng0.46000041 × dày0.27999983 mm tại contact ring Y=0.
- TO-92: đáy thân2.50000000; đỉnh7.59999978 mm. Tâm exits X=[−1.27000003,0,1.27000003]; tâm tips X=[−2.54000005,0,2.54000005] mm. Section0.44000015 ×0.42000000 mm. Bounds X gồm fan-out là5.52000026 mm, lớn hơn W thân4.60000002 mm như dự kiến.

Bounds visible fixed, gồm chân và chi tiết hiện được trong phép đo headless: resistor8.1200000644 ×2.5513593791 ×1.7527187581; diode8.21999990 ×3.10399998 ×2.30799997; Zener8.12000006 ×2.40399998 ×1.60799995; ceramic4.99999994 ×6.19999997 ×2.20000003; electrolytic6.31000007 ×12.20000029 ×6.30000014; LED5.79999980 ×10.20000014 ×5.79999980; DIP14 19.00000026 ×4.05200000 ×7.89999984; TO-92 5.52000026 ×7.59999978 ×3.90000000 mm. Bounds loại pick targets vô hình; text canvas bị ẩn trong Node. Sơn và chấm pin1 làm bounds nhỉnh hơn thân, nên không dùng chúng làm số đo body/seated height.

## Solid, feedthrough và collision

- Tám mesh thân cùng các mẫu chân đã kiểm tra có signed volume dương, không có boundary/nonmanifold edge sau weld vị trí ở tolerance `1e-7 world`, và không có cặp cạnh định hướng bất nhất. Đây là kiểm tra triangles/winding, không phải chỉ `Box3.containsPoint`.
- Traversal position/normal attributes của toàn bộ mesh trong tám model hiện hành: không có giá trị nonfinite hoặc normal bằng0.
- Với24 assembly trong `sealed-package-parity.json`, từng feedthrough sau transform có điểm tại0.075 mm bên trong đồng thời nằm trong solid seal thật và metal thật bằng ray parity; toàn bộ mesh chân flexible trong corpus không có welded boundary edge.
- Đã sửa lỗi cap round: dựng cap từ end ring thực của tube. Reproducer đường chéo `(0,0,0) → (1,2,3)` trước có64 cạnh hở, sau sửa còn0. Đầu cap độc lập theo quaternion không còn dùng để đóng tube.
- P2 collision của vai DIP đã đóng: repro có thân resistor và DIP không chạm nhau nhưng metal pin1 đi qua resistor hiện bị validator từ chối. Kiểm tra lặp tại board yaw0°/37°/90°/180° đều từ chối; descriptor DIP historical vẫn giữ semantics cũ.
- Capsule canonical đã đối chiếu từng vertex metal ngoài của cả tám family ở yaw37°. Mọi vertex nằm trong envelope; excess lớn nhất chỉ `1.45e-7 mm` do Float32. Hidden embed không tham gia đường collision. Flexible candidate index xét cả metal rigid; regression còn bắt tail TO-92 và chân fixed round/square chạm body/chân khác.
- Chín acceptance case chung của fixture rigid đều khớp TypeScript; Python fixture/regression tương ứng đã pass trong bộ kiểm tra nhỏ bên dưới.
- Validator lọc các module thực sự có đường chân trước khi kiểm tra cặp. Regression mở/lưu lại 20.000 module legacy phát hiện vòng duyệt bậc hai trên cả những module không có geometry chân; sau sửa, case này hoàn tất khoảng702 ms trong lượt kiểm tra mục tiêu. Scene index vẫn xét metal của mọi shape mới.

## Lỗi mặt DIP trông méo trong ảnh cận cảnh

Ảnh người dùng bổ sung cho thấy mảng sáng tối tam giác quanh notch mà góc isometric trước đó chưa bộc lộ rõ. Probe xác nhận19 tam giác cap đều nằm trên Y=3.03999995956 mm, face normal +Y; tuy nhiên49/57 corner normals bị nghiêng, tối đa33.844°. `toCreasedNormals` dùng bin vị trí0.01 world (xấp xỉ0.195 mm, lớn hơn bevel0.12 mm) và crease60°, trộn normals cap/bevel/notch. Interpolation trên các tam giác cap dài tạo cảm giác lõm dù vị trí vertices đồng phẳng.

Đã tách normal cap khỏi bevel/notch bằng topology thật của loft, không dùng hash vị trí cố định. Mặt trên/dưới giữ normal phẳng; mặt cong dùng corner-angle smoothing. Theo ảnh hốc bổ sung, notch đổi từ ramp thành đáy bán nguyệt phẳng sâu0.75 mm và thành cong thẳng đứng. Ray tests lấy nhiều điểm đáy và hai cao độ trên thành để phân biệt cavity thật với ramp. Gallery có góc `TOP-FRONT-LEFT` và ảnh macro nhìn vào đầu notch; ảnh native xác nhận mặt cap phẳng và cavity đúng kiểu tham chiếu.

Audit sau sửa DIP lưu tại `apps/web/.test-build/sealed-geometry-audit.json`: `failures=[]`. DIP có19 tam giác top,19 bottom và30 floor; normal đều đúng mặt phẳng, tilt0°, không triangle suy biến. Đáy hốc đo3.290000026 mm trên contact plane; thành giữ cùng contour ở ba cao độ. TO-92 giữ normal phẳng ở front/caps và48 tam giác lưng vẫn được smooth. Toàn bộ mesh trong tám model có position/normal hữu hạn, normal khác0; các body/pin-metal đều kín, winding nhất quán và volume dương.24 assembly flexible vẫn giao solid seal/metal thật sau đổi resistor. Descriptor R36 revision3 từ runtime native trước thay đổi được deep-compare với history hiện hành: bằng nhau hoàn toàn. Các kiểm tra ceramic và vật liệu LED sau đó được ghi riêng bên dưới.

Audit R49 riêng: `apps/web/.test-build/sealed-geometry-audit-r49.json`. Body và bounds visible được đo lại trên model4.90×1.75;24 fixture tiếp tục PASS. Snapshot descriptor R43 revision5 độc lập lấy từ bundle trước thay đổi bằng hoàn toàn historical R43 hiện hành; render R43 cũng tái tạo đúng bounds đã đo trước đó. R39 tái tạo đúng bounds cũ; full descriptor/profile có SHA đóng băng trước resize trong regression catalog.

## Rebuild và kiểm tra đã hoàn thành riêng

Native gallery phát hiện thêm hai vấn đề cục bộ sau khi các gate đầu đạt. Ceramic dùng radial fan trên outline có boots lõm: mesh vẫn kín nhưng238 tam giác front bị đảo projected orientation và ray tại boot-root cắt6 mặt. Đã thay bằng triangulation đúng outline lõm, midpoint dùng chung và dome theo khoảng cách tới outline; còn2,042 vertices/4,080 triangles (ít hơn2,342/4,680 cũ), projected inversion0, ray chỉ cắtfront/back đúng2 lần. Bounds và vùng seal giữ nguyên.

LED giữ surface`#781521`, transmission0.28, roughness0.25, thickness5 mm và attenuation distance7.5 mm đổi sang world. Absorption dùng tint thể tích nhẹ hơn để tránh áp màu rượu tối hai lần; helper khởi tạo/update dùng cùng mapping. Ảnh nền tối ban đầu cho thấy opacity0.92 hiện rõ frame, nhưng góc isometric trên breadboard sáng bộc lộ ghosting quá mạnh. A/B tám biến thể trên cùng góc sáng chọn **opacity0.98**: vỏ gần đặc, cup/anvil và trụ chỉ hiện mờ; nền trắng vẫn có ghosting nhẹ, không giống kính cửa. Đổi riêng shadow, optical path hoặc IOR không tạo cân bằng tốt hơn trong các ảnh đã thử. Giữ shadow, IOR1.54, geometry, ánh sáng, camera và emission; descriptor LED cũ giữ optics cũ. Test tính Beer attenuation qua5 mm trước diffuse/transmission, cùng regression opacity, màu lựa chọn, ON/OFF/unknown và descriptor cũ; ảnh native mới là bằng chứng hiệu quả hiển thị frame. Diagnostic native bright-board1 PASS/2.0 phút, API shutdown exit0; tám PNG, JSON thông số và source diagnostic giữ ở `apps/web/.test-build/led-optics-brightboard`. Diagnostic nền tối trước đó1 PASS/26.1 s ở `led-optics-diagnostic`.

Explicit preview/rebuild hỗ trợ free module và rigid nhiều chân, dùng descriptor hiện hành rồi validate trước commit. Regression xác nhận giữ module ID, properties, pin IDs, contact bindings, connections và net IDs; preview không sửa document, commit thành một Undo, Undo khôi phục snapshot. Preview free đã thay position bị từ chối. Repro va chạm DIP khi rebuild tại bốn góc board ở trên bị từ chối, snapshot giữ nguyên và history không thêm entry.

| Kiểm tra nhỏ đã thực chạy | Kết quả |
|---|---|
| Web `workbench.test.ts` + `rigid-lead-collisions.test.ts`, bundle esbuild rồi chạy Node test | 25 PASS, gồm regression 20.000 module legacy |
| `.audit-runtime/Scripts/python.exe -m pytest -q tests/contracts/test_rigid_lead_collisions.py` | 8 PASS |
| Probe độc lập dimensions, winding/closure,24 flexible seals, cap chéo, capsule metal và rebuild xoay board | PASS theo phạm vi nêu trên |
| 11 bộ Web geometry/material/thumbnail/parity/rebuild sau sửa ceramic/LED (`.test-build/check-sealed-surfaces.mjs`) | PASS cuối: 84/84, 6.15 s sau opacity0.98; kết quả trong tool stdout. Lượt trước đó lưu ở `apps/web/.test-build/sealed-final-surface-tests.log`. |

## Gate tích hợp

| Gate | Trạng thái |
|---|---|
| Full pytest — `.audit-runtime/Scripts/python.exe -m pytest -q` | PASS: 1103 passed, 1 skipped; 307.95 s sau sửa DIP và preset R39. Hai bước đổi riêng chiều dài R43/R49 sau đó được kiểm tra bằng bộ Python catalog/mounting/parity liên quan; không gọi lượt full này là một lượt chạy trên preset R49. Test FPGA Icarus/vvp skip vì thiếu executable local; gate đó yêu cầu FPGA CI. Log: `.superpowers/sealed-final-python.log`. |
| Python R49 — `pytest -q tests/frontend/test_physical_catalog.py tests/contracts/test_component_mechanics_catalog.py tests/contracts/test_sealed_package_profiles.py tests/contracts/test_rigid_lead_collisions.py` (cùng interpreter ở trên) | PASS: 38 passed, 8.65 s, exit0; kết quả lưu trong tool stdout của lượt kiểm tra, không có log riêng trên đĩa. |
| Full Web tests/typecheck — `npm --prefix apps/web test` | PASS sau preset R49: 1192/1192, 109.11 s ở Node test runner; gồm regression 20.000 module legacy. Sau các sửa đổi cục bộ ceramic/LED cuối, 84 test liên quan và `vue-tsc --noEmit -p tsconfig.tests.json` đều PASS; không gọi lượt full trước đó là đã chạy lại sau các sửa đổi này. Log: `apps/web/.test-build/sealed-r49-web.log`. |
| Production build — `npm --prefix apps/web run build` | PASS sau sửa ceramic/LED opacity0.98 trên source R49 cuối: vue-tsc + Vite6.4.4, 316 modules transformed; Vite build21.39 s. Main JS5,367.47 kB (gzip574.10 kB); cảnh báo chunk >500 kB không chặn build. |
| E2E typecheck — `vue-tsc --noEmit -p tsconfig.e2e.json` từ `apps/web` | PASS sau tách ca LED để có thể chạy kiểm tra độc lập; đã sửa annotation nullable mount của fixture gallery theo valid solution đã assert. |
| Catalog — `.audit-runtime/Scripts/python.exe scripts/sync_editor_catalog.py --check` | PASS: 84 editor types, 63 physical parts |
| Context — `.audit-runtime/Scripts/python.exe scripts/check_context.py` | PASS |
| Web AST boundaries — `npm --prefix apps/web run check:boundaries` | PASS: 207 source modules |
| Contract generation — `.audit-runtime/Scripts/python.exe scripts/generate_contracts.py --check` | PASS (exit0); generated artifacts khớp source |
| Public compatibility, deterministic generation và byte-exact baseline | PASS trong full pytest (`test_contract_codegen.py`, `test_public_compatibility.py`) |
| Native E2E thao tác | PASS 8 ca riêng biệt qua các lượt: authoring assignment; placement/re-anchor/history/reload; diode/Zener move/spans; 3 vòng GPU place/re-anchor/delete; automatic templates/radial proportions; property drafts qua 2 viewport/17 ảnh; legacy resistor rebuild; rigid DIP/free TO-92 preview/cancel/rebuild/Undo/Redo/reload. Lượt R49 `npm run test:e2e -- sealed-package-models.spec.ts` đạt 2 PASS/6.3 phút, gồm gallery và rigid/free rebuild. Log: `apps/web/.test-build/sealed-native-r49-final.log`. |
| Native gallery và xem ảnh thực | Gallery R49 đã chụp đủ tám family, tư thế resistor đứng/nằm, góc đầu axial và macro notch. Lượt focused sau sửa ceramic đạt 1 PASS/2.5 phút, có ceramic-front và electrolytic-LEFT đọc đủ value/rating; log `apps/web/.test-build/sealed-native-surfaces-final.log`. Ca LED được tách để kiểm tra riêng sau chốt vật liệu: `npm run test:e2e -- sealed-package-models.spec.ts --grep "refined LED optics"` đạt **1 PASS/2.0 phút** trên source opacity0.98. Ba ảnh isometric/FRONT/LEFT giữ vỏ rượu gần đặc và frame mờ; export graph bằng đầu vào, không pageerror, API shutdown exit0. Native material assertion đúng `781521`/opacity0.98/transmission0.28/roughness0.25 và đủ bốn phần frame; JSON `led-native-optics.json`, kết quả runner trong tool stdout. |

Ảnh giữ riêng ở `apps/web/.test-build/sealed-model-gallery`. Các lượt đầu ghi ở `sealed-native-final.log` (5 PASS/4 fail) và `sealed-native-retry.log` (3 PASS/1 fail). Lỗi fixture thiếu metadata, so sánh -0/0 sau JSON, revision cố định, timeout chụp 17 ảnh và screenshot quá20 giây trên software WebGL đã được sửa rồi kiểm tra lại thành công ở các lượt phía trên. ViewCube khi ở mặt LEFT cull corner đối diện; harness dùng Compass hoặc Home view trước khi chọn corner để thao tác đúng giao diện. Lượt thăm dò bị HMR invalidate và lượt ngắt vì chờ ViewCube không được dùng làm chứng cứ. Các runner đã kết thúc đều dọn API exit0.

Ảnh resistor R49 và DIP đã chụp lại từ source sau sửa normal/notch và resistor4.90×1.75. Không dùng hai ảnh axial-end RIGHT bị thành breadboard che để chứng minh seal; gallery dùng góc elevated thay thế. Ảnh free có breadboard phía sau để giữ ngữ cảnh, không chứng minh free module được cắm contact. Playwright attachments của lượt LED cuối được giữ riêng tại `apps/web/.test-build/sealed-native-alpha98-evidence`; gallery có tổng25 PNG của các góc model và rebuild.

Không commit, push, merge hoặc deploy trong đợt bàn giao này.

Nội dung commit đề xuất:

```text
fix: refine 3D packages and sealed lead geometry

- Correct DIP surfaces/notch and discrete package shapes/materials.
- Set resistor body to 4.90x1.75 mm and preserve pinned descriptors.
- Share lead collision geometry and validate rebuild/history behavior.
```
