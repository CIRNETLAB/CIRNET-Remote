# net*CIRCUIT Remote — Báo cáo đối chiếu Contracts và tối ưu kiến trúc FPGA

**Ngày:** 15-10-2026  
**Đối tượng:** FPGA Architecture Lab-First v2  
**Tài liệu thay thế đề xuất:** `net-Circuit-Remote_FPGA_Architecture_Lab-First_v2.md`, nội dung Revision 2.1  
**Phạm vi:** FPGA, external safety/protection, scan/routing, instrument interfaces, clocks, memory và transport endpoint.

> **Kết luận:** v2 phù hợp về triết lý Lab-First và phân chia khối chức năng, nhưng chưa đủ cơ sở xác nhận khớp Contracts hiện hành; còn các chỗ thiếu ràng buộc giao dịch, điện và dữ liệu để freeze implementation. Revision 2.1 là đề xuất kiến trúc được viết lại, không phải chứng nhận RTL/PCB đã đạt yêu cầu.

---

# 1. Cơ sở và mức độ kết luận

## 1.1 Nguồn thực tế

**[S1]** `net-Circuit-Remote_Architecture_v3_Lab-First(2).md`. Ba dòng đầu ghi `SUPERSEDED`, yêu cầu không dùng làm current implementation authority và trỏ tới `docs/ARCHITECTURE.md (Lab-First v3.1)`.

**[S2]** `net-Circuit-Remote_FPGA_Architecture_Lab-First_v2(1).md`. Bản này tự ghi tham chiếu v3.1, dùng `InstrumentationExecutionPlan` và nhắc `1.0-scaffold`.

Bản Project của [S1] không có cảnh báo đầu file. Bản Project của [S2] và bản đính kèm có cùng nội dung. Không có nội dung v3.1 hiện hành, schema/ICD, RTL, schematic hoặc báo cáo đo trong bốn file được cung cấp. Việc tìm trong tài liệu Project hiện có không bổ sung được những bằng chứng này.

Dẫn nguồn trong báo cáo dùng **mục của tài liệu gốc và số dòng file đính kèm**, không phải số dòng Revision 2.1. Các tài liệu hãng [H1]–[H5] và SHA-256 nguồn được ghi ở Phụ lục A của bản kiến trúc đi kèm.

## 1.2 Ba mức phải tách riêng

| Mức | Có thể kết luận từ tài liệu hiện có? | Kết quả |
|---|---|---|
| Đúng triết lý/semantics Lab-First | Có, với baseline đã cung cấp | Nền tảng đúng; cần làm rõ các ranh giới bên dưới |
| Khớp schema/enum/ABI Contracts hiện hành | Không | Chưa có authority v3.1 và schema/ICD để đối chiếu |
| Fit và vận hành đúng trên bo FPGA | Không | Chưa có synthesis/timing/pin/bench evidence |

Không chấm một tỷ lệ “khớp 90%/100%” vì thiếu tập yêu cầu hiện hành và test results để tạo mẫu số có ý nghĩa.

## 1.3 Ý nghĩa mức ưu tiên

**P0:** phải giải quyết trước khi cho phép energize hoặc tin cậy vào đường bảo vệ. Đây là mức ưu tiên của yêu cầu thiết kế, không phải kết luận đã phát hiện lỗi trên bo thật.

**P1:** cần đóng trước tích hợp contract, acquisition hoặc công bố capability.

**P2:** tối ưu tài nguyên, cấu trúc và tính kiểm chứng; không mặc định là lỗi an toàn.

---

# 2. Những phần v2 đã đúng và phải giữ

Không nên bỏ toàn bộ thiết kế hoặc tăng FPGA ngay. Những nội dung sau đã có trong v2:

| Nội dung được giữ | Bằng chứng [S2] |
|---|---|
| Safety khác correctness; không chặn chỉ vì topology sai | §2, dòng 59–130 |
| Sáu plane, FPGA làm công việc deterministic | §3, dòng 134–173; §5, dòng 263–312 |
| Protected I/O, external voltage-domain boundary | §13, dòng 973–1046 |
| Fail-safe trước cấu hình, không phụ thuộc riêng RTL | §9.2.1, dòng 672–701 |
| Two-stage fault shutdown | §9.3, dòng 703–729 |
| Shadow routing, break-before-make | §11, dòng 758–810 |
| Execution epoch chống command cũ | §8.1, dòng 502–539 |
| LA/Scope/Generator độc lập; AFE/ADC/DAC ngoài FPGA | §18–20, dòng 1181–1340 |
| SDRAM chung có arbiter; host không sở hữu địa chỉ vật lý | §23–24, dòng 1416–1584 |
| CDC, pin/package/clock closure, capability dựa trên bằng chứng | §25, §28, §39 |
| Portable RTL và wrappers khi EP4CE6 → EP4CE10 | §30, dòng 1894–1953 |

Vì các cơ chế trên đã hiện diện, nhận xét đúng là **“chưa chặt/chưa đầy đủ ở các trường hợp biên”**, không phải “v2 không có safety/CDC/arbiter”.

---

# 3. Các phát hiện và cách xử lý trong bản sửa

## R-01 — Authority hiện hành chưa được đối chiếu

**Mức:** P1 — điều kiện tiên quyết của tuyên bố conformance.

**Nguồn:** [S1] dòng 1–3; [S2] dòng 4–12 và §46, dòng 2575–2588.

**Vấn đề:** tên file v3 không đủ để coi nội dung là implementation authority khi chính file đã đánh dấu superseded. V2 lại tuyên bố dựa vào v3.1 và scaffold mà không kèm định nghĩa nguồn.

**Xử lý:** Revision 2.1 §0, §3, G-01 phân biệt review baseline với current authority; không tuyên bố fully compliant v3.1. Loại các câu mô tả repository/công cụ hiện hành như thể đã đọc source.

**Đóng khi:** mapping với authority/schema/ICD hiện hành được kiểm tra. Không dùng tài liệu hãng để thay Contracts riêng của dự án.

## R-02 — Tên plan, command và capability chưa có bảng ánh xạ

**Mức:** P1.

**Nguồn:** [S1] §8 dòng 398–434, §30 dòng 1708–1745, §33 dòng 1840–1876; [S2] §6 dòng 316–388, §28 dòng 1774–1848.

**Vấn đề:** `PhysicalExecutionPlan` và `InstrumentationExecutionPlan` không có bằng chứng là cùng schema. `SET_ROUTE`/`SET_CLOCK` và các micro-operation mới chưa được tách khỏi wire operations. Capability camelCase và nested/snake-case chỉ là ví dụ, chưa có mapping được chứng minh.

**Xử lý:** giữ tên contract ngoài theo authority, dùng `FpgaExecutionImage` chỉ cho cấu trúc nội bộ. Bổ sung CT-01…CT-22, bảng semantic command, version/ICD gate. Không tự đặt opcode, enum application hoặc tuyên bố binary compatibility.

**Vị trí sửa:** §3–5, §26, §28.

## R-03 — Plan-level safety xuất hiện trước khi có plan cuối cùng

**Mức:** P0.

**Nguồn:** [S2] §2 dòng 67–114; §6 dòng 339–347; §9.0 dòng 570–581.

**Vấn đề:** tài liệu nói safety kiểm tra route/drive/instruments nhưng sơ đồ lại đặt bước đó trước compiler tạo execution plan. Nếu approval không gắn đúng cấu hình phát sinh sau compile, FPGA có thể áp dụng một image khác với image đã được kiểm tra. Đây là khoảng trống thứ tự/ràng buộc, không phải bằng chứng implementation hiện tại đã mắc lỗi.

**Xử lý:** candidate image → kiểm tra hoàn chỉnh → seal revision → approval gắn image → de-energized apply → guarded power-up. Thay đổi ngoài tập runtime updates đã phê duyệt làm mất approval. FPGA giới hạn request bằng board/build envelope, không nhận hard limits tùy ý.

**Vị trí sửa:** §4, §8; V-05.

## R-04 — PASSIVE_SCAN có stimulus; pre-safety chưa tách phép đo không năng lượng

**Mức:** P0.

**Nguồn:** [S2] §9.0 dòng 559–568; §12 dòng 855–947.

**Vấn đề:** `PASSIVE_SCAN` vừa được gọi passive vừa áp stimulus. Quan sát không kích thích không đủ chứng minh continuity của hai node cùng đang ở 0 V. Cũng chưa rõ quyền dùng nguồn test được tạo trước khi có execution plan như thế nào.

**Xử lý:** tách `PASSIVE_OBSERVE`, `LIMITED_ENERGY_CONTINUITY`, `ACTIVE_SIGNATURE_SCAN`; scan-context permit riêng với voltage/current/dwell bounds. Tên mới là đề xuất nội bộ, không silently đổi wire enum. Scan FIFO full/host stall phải tắt stimulus trước khi chờ.

**Vị trí sửa:** §7.2, §8.2, §13; V-03/V-04.

## R-05 — Không được biến “unknown được guarded” thành bảo đảm an toàn cho mọi IC

**Mức:** P0.

**Nguồn:** [S1] §9.4 dòng 690–703, §27.1 dòng 1449–1473, ADR-LAB-003 dòng 3165–3172; [S2] §35 dòng 2189–2209.

**Vấn đề:** v2 giữ đúng chính sách cho unknown chạy khi an toàn. Tuy nhiên hardware contract cần nói rõ current-limited supply không tự xác nhận polarity, injection paths hoặc pin-domain cho một linh kiện tùy ý.

**Xử lý:** unknown identity không chặn; unknown electrical safety vẫn là indeterminate. Không đoán VCC/GND bằng cách cấp nguồn thử tùy ý. Signature test chỉ chạy với profile và điều kiện đã phê duyệt.

**Vị trí sửa:** §1, §7.4, §13–14.

## R-06 — FPGA watchdog chưa đủ chứng minh shutdown khi chính FPGA clock ngừng

**Mức:** P0.

**Nguồn:** [S2] §9.2.1 dòng 672–701, §10 dòng 733–754, §25 dòng 1588–1654.

**Vấn đề:** v2 đã có fail-safe và watchdog, nhưng không chỉ ra đầy đủ đường phát hiện clock/control loss độc lập. Một counter dùng clock đã ngừng không thể tiếp tục đếm tới timeout; một pin enable có thể giữ mức trước đó.

**Xử lý:** external interlock/latch/watchdog có timebase độc lập trực tiếp điều khiển rail cutoff, digital OE, scan source và generator disconnect. FPGA còn hoạt động thì ghi evidence và cleanup. Heartbeat phục vụ watchdog ngoài không được là bộ chia tự chạy che giấu control fault thuộc fault model.

**Vị trí sửa:** §7, §9–10, §17; V-01/V-02.

## R-07 — Tắt FPGA drive chưa đủ cho route commit khi DUT còn nguồn

**Mức:** P0.

**Nguồn:** [S2] §11.1 dòng 784–810, §36 dòng 2213–2237.

**Vấn đề:** IC thật đang được cấp nguồn vẫn có thể drive outputs dù FPGA OE đã OFF. Nếu chỉ disable affected FPGA outputs trước make/break, transient hoặc contention vẫn có thể xảy ra từ DUT hoặc generator.

**Xử lý:** V1 không live-reroute; loại quyền nguồn của cả DUT và mọi affected source, kiểm tra electrical-safe condition, sau đó break/wait/make/verify. Commit không tự restore drive. Nguồn ngoài không kiểm soát phải giữ inhibited/fault.

**Vị trí sửa:** §9.2, §11–12; V-06/V-07.

## R-08 — Atomic shadow commit không đồng nghĩa mọi switch ngoài FPGA đổi tức thời

**Mức:** P0/P1 tùy loại route.

**Nguồn:** [S2] §11 dòng 758–810.

**Vấn đề:** shadow/active là cơ chế đúng, nhưng serial switch configuration vẫn đi qua nhiều trạng thái trung gian. Register readback không chứng minh tiếp điểm không stuck-on. Cần phân biệt atomic publication, physical sequencing và verification coverage.

**Xử lý:** chỉ công bố active route revision sau completion; trong suốt transaction giữ energy inhibit. Verification method theo fault model của từng path. Mất completion/verification không tự rollback về trạng thái powered cũ.

**Vị trí sửa:** §11.2, §12.

## R-09 — Cleanup dữ liệu không được đứng trước electrical isolation như điều kiện chờ

**Mức:** P0.

**Nguồn:** [S2] §9.3 dòng 703–729; §36 dòng 2230–2237.

**Vấn đề:** v2 đã ưu tiên energy inhibit, nhưng Stage 2 liệt kê đóng descriptor trước route isolation; shutdown thường liệt kê dừng capture trước tắt power. Nếu RTL diễn giải thành chuỗi chờ memory drain, lỗi acquisition/SDRAM có thể trì hoãn phần điện.

**Xử lý:** energy inhibit độc lập; isolation theo electrical criteria và deadline; capture drain/seal là cleanup song song, bounded. Dữ liệu không seal được thì báo partial/invalid, không chờ vô hạn để có descriptor đẹp.

**Vị trí sửa:** §9; V-02/V-15/V-16.

## R-10 — Epoch chưa xử lý đầy đủ hard reset, queued heartbeat và descriptor reuse

**Mức:** P0/P1.

**Nguồn:** [S2] §8.1 dòng 502–539, §27 dòng 1757–1770.

**Vấn đề:** counter tăng sau fault là đúng nhưng không chứng minh freshness sau hard reset nếu counter quay về cùng giá trị. Byte cũ có thể còn trong bridge; duplicate pulse/START có side effects. Execution lifetime cũng khác capture-readback lifetime.

**Xử lý:** link/boot session + execution epoch + image revision + sequence; verified reset-and-drain hoặc independent boot generation; bounded duplicate suppression. Read-only descriptor dùng generation riêng, không tự mất sau STOP.

**Vị trí sửa:** §5, §10, §22, §26; V-11/V-17.

## R-11 — “Mọi invalid/stale packet đều default-open” quá rộng

**Mức:** P1.

**Nguồn:** [S2] §11.2 dòng 813–825; §45 dòng 2518–2531.

**Vấn đề:** một read offset sai hoặc command cũ bị reject trước side effect không chứng minh active image hiện tại mất an toàn. Cắt nguồn/đổi route vì mọi lỗi như vậy làm availability kém và phá thí nghiệm đang hợp lệ. Ngược lại, không được coi state corruption là benign packet error.

**Xử lý:** taxonomy rõ: request rejection → NACK không side effect; corruption → resync/watchdog; trusted-state loss hoặc critical electrical fault → inhibit. Đây là thay đổi có chủ đích của bản sửa, không được gắn nhãn “v2 đã quy định như vậy”.

**Vị trí sửa:** §12.3, §27.

## R-12 — Execution FSM và capture FSM đang dễ bị diễn giải thành một chuỗi độc quyền

**Mức:** P1.

**Nguồn:** [S2] §8 dòng 452–479; §18 dòng 1185–1204; §36 dòng 2217–2227.

**Vấn đề:** `RUNNING → CAPTURING` không đủ mô tả pre-trigger hoặc thu transient power-up. Thời điểm enable clock/generator cũng phải gắn với arm/readiness barrier thay vì chỉ kết thúc power sequence.

**Xử lý:** execution FSM riêng; capture FSM riêng từng instrument; arm có thể bắt đầu pre-trigger acquisition trước START. Memory admission phải có hiệu lực từ lúc acquisition thực sự ghi, không chỉ từ START. Required consumers phải ACK đúng arm generation.

**Vị trí sửa:** §6, §16, §18–22.

## R-13 — Shared timestamp/trigger chưa xác lập uncertainty giữa clock domains

**Mức:** P1.

**Nguồn:** [S2] §16–17 dòng 1108–1177, §25 dòng 1605–1622.

**Vấn đề:** có counter chung và synchronizers không đồng nghĩa mọi instrument lấy mẫu đồng thời. Synchronizer tạo latency/uncertainty; binary timestamp bus không được đồng bộ từng bit; asynchronous digital bus không tự trở thành snapshot nguyên tử.

**Xử lý:** local sample counters + global anchors + clock/profile generation + trigger index + alignment uncertainty. Common-clock path hoặc measured calibration khi yêu cầu alignment chặt. Status synchronizer không được thay measurement frontend.

**Vị trí sửa:** §15, §17–18; V-21/V-22.

## R-14 — Descriptor thiếu quy định sealing, retention và read-after-stop

**Mức:** P1.

**Nguồn:** [S2] §23.2–24 dòng 1515–1584; §33 dòng 2124–2158.

**Vấn đề:** ID/base/valid bytes chưa đủ trả lời khi nào sample cuối đã ghi xong, ai được release, queued read còn hợp lệ không và STOP có xóa dữ liệu không. Ring pre-trigger cần thứ tự thời gian, không chỉ physical address.

**Xử lý:** descriptor ID + allocation generation; completion sau last-write drain; public descriptor không expose physical address; capture immutable sau seal; STOP giữ dữ liệu nếu memory khỏe. Reuse chỉ sau release và generation đổi; ring readback tuyến tính theo thời gian.

**Vị trí sửa:** §9.4, §22–23; V-14…V-17.

## R-15 — Băng thông trung bình và RLE không chứng minh lossless acquisition

**Mức:** P1.

**Nguồn:** [S2] §18 dòng 1219–1247; §23.1.1 dòng 1476–1513.

**Vấn đề:** RLE có thể tăng record rate khi tín hiệu đổi nhanh. Tổng demand nhỏ hơn bandwidth trung bình vẫn overflow nếu memory service gap quá dài. Nếu sustained payload measurement đã gồm refresh thì trừ refresh lần nữa làm budget sai.

**Xử lý:** packed-byte demand; raw hoặc worst-case encoding admission; chọn rõ peak×efficiency hoặc measured-payload model; FIFO sizing theo `R_max × L_max + burst + margin`; kiểm tra cả capacity và service-gap bounds. Không coi “có 64 MB RAM” là “capture tùy tốc độ”.

**Vị trí sửa:** §19.3, §24; V-18…V-20.

## R-16 — Một số lựa chọn tổng quát làm tăng độ phức tạp không cần thiết cho V1

**Mức:** P2.

**Nguồn:** [S2] §7 dòng 429–439, §20 dòng 1333–1340, §23 dòng 1440–1550; §41/§47 về cấu hình một fabric.

**Vấn đề:** v2 chỉ nói AWG optional nhưng sơ đồ dễ được hiểu rằng generator luôn là SDRAM client. General allocator hoặc deadline scheduler quá rộng không phải cách duy nhất để đáp ứng một active execution context.

**Xử lý:** DDS cơ bản dùng local LUT, AWG OFF; arena/bump allocation hữu hạn khi idle; burst-limited arbiter theo validated workload profiles; shared readback best effort; không full N×N route fabric khi chỉ cần endpoint access. Các tối ưu này giảm số trạng thái và tài nguyên cần kiểm chứng, nhưng chưa phải số LE tiết kiệm đã đo.

**Vị trí sửa:** §2, §11, §21–24, §30.

## R-17 — Pin/PLL closure đã có tên nhưng chưa có budget đủ để quyết định E144

**Mức:** P1 — hardware feasibility.

**Nguồn:** [S2] §25.3 dòng 1624–1654, §39 dòng 2316–2380; [H1] bảng 1-1 và 1-3.

**Vấn đề:** EP4CE6 và EP4CE10 đều có 2 PLL và 91 user I/O ở E144. Nâng từ EP4CE6 sang EP4CE10 trong cùng package không tăng I/O. SDRAM, ADC/DAC parallel, USB FIFO và LA có thể vượt số chân trước khi hết LE.

**Xử lý:** chọn candidate interfaces của cấu hình cuối trước freeze PCB; ưu tiên serialize low-rate controls, không serialize tùy tiện measurement paths. E144 vẫn là candidate. Package lớn hơn trong EP4CE10 được cân nhắc trước thay họ chip nếu giới hạn là pin.

**Vị trí sửa:** §17, §25.3, §29, G-03/G-04.

## R-18 — Protection phải bao phủ sense/scan/generator và tình huống mất nguồn

**Mức:** P0.

**Nguồn:** [S2] §9.2.1, §13 dòng 973–1046; [H2] powered-off protection/fail-safe logic discussion.

**Vấn đề:** v2 đã có voltage boundary. Cần mở rộng fault model rõ cho cả DUT→sense/ADC, powered-off switches, output amplifier còn DC và reverse-current paths. OE OFF hoặc DAC code zero không luôn có nghĩa electrical isolation.

**Xử lý:** profile từng route class; voltage/current/injection/off-state limits; external generator disconnect/mute; discharge và uncontrolled external-source detection. Không dùng một loại switch minh họa như BOM đã chọn.

**Vị trí sửa:** §7, §9.2, §11, §14, §20–21.

## R-19 — Local control priority chưa phải hard deadline từ host tới DUT

**Mức:** P0/P1 tùy cách dùng deadline.

**Nguồn:** [S2] §26.2 dòng 1714–1736.

**Vấn đề:** chunking/priority xử lý được starvation bên trong endpoint. Nó không chứng minh host/USB/bridge luôn đưa STOP tới trong một thời gian hữu hạn khi host ngừng tiến triển hoặc cable disconnect.

**Xử lý:** nêu rõ boundary và giả định của `T_local_control_max`; independent watchdog/cutoff chịu trách nhiệm khi link không tiến triển. Không quảng bá một phép đo latency hữu hạn là chứng minh upper bound vô điều kiện.

**Vị trí sửa:** §10, §25–26, G-08.

## R-20 — Capability, calibration và thông số phần cứng còn là mục tiêu

**Mức:** P1/P2.

**Nguồn:** [S2] §19 dòng 1287–1296, §22 dòng 1371–1390, §28–29 dòng 1774–1890, §45 dòng 2486–2492.

**Vấn đề:** ADC/DAC/SDRAM part và rate chưa chốt; build flag, validation và runtime availability đôi khi trộn nhau. “64 MB” chưa chỉ rõ số byte. Không thể chứng minh simulator/repository tooling hiện trạng từ một câu trong architecture proposal.

**Xử lý:** tách implemented/validated/available; số channel mục tiêu không là usable capability. Chuẩn hóa **đề xuất** 64 MiB bằng số byte, không silently sửa BOM; part khác thì báo capacity thật. Calibration/profile revision nằm trong descriptor. Mọi gate chưa có bằng chứng giữ OPEN.

**Vị trí sửa:** §20–23, §28–29, §31, §33–34.

---

# 4. Tính toán minh họa phục vụ quyết định kiến trúc

## 4.1 Pin budget giả định

Giả sử chọn SDRAM x16 với 39 tín hiệu; hai ADC parallel 12-bit dùng 24 data pins; hai DAC parallel 12-bit dùng 24 data pins; USB FIFO x16 dùng 16 data pins.

```text
39 + 24 + 24 + 16 = 103 > 91
```

Chưa tính các control/clock ngoại vi, safety, LA và scan. Kết luận chỉ là **cấu hình giả định này không fit E144**, không phải mọi thiết kế E144 đều không khả thi. Serial/shared converter interfaces hoặc package khác là các phương án cần đánh giá cùng throughput và timing. Số 91 đến từ [H1]; các lựa chọn interface ở ví dụ là giả định do bản review đặt ra.

## 4.2 Memory service giả định

Giả sử SDR x16 ở 100 MHz, hiệu suất payload 65%, reserve factor 80%:

```text
Peak        = 2 byte × 100 MHz = 200 MB/s
Admissible  = 200 × 0.65 × 0.80 = 104 MB/s
Scope       = 2CH × 25 MS/s × 2 byte = 100 MB/s
LA          = 20 MS/s × 2 byte = 40 MB/s
Total       = 140 MB/s > 104 MB/s
```

Không admission workload này. RAM sâu hơn chỉ tăng thời gian lưu, không sửa thiếu throughput. Ngay cả khi tổng dưới 104 MB/s, phải kiểm tra max service gap và FIFO depths. Tất cả rate/efficiency của ví dụ là giả định, không phải capability net*CIRCUIT.

## 4.3 Không kết luận “tối ưu tuyệt đối”

Tối ưu ở revision này có mục tiêu cụ thể: ít ownership ambiguity, ít trạng thái nguy hiểm, ít SDRAM clients không cần thiết, ít allocator/arbiter complexity, ít pin controls tốc độ thấp và rõ quality/lifetime. Chưa có synthesis/resource/throughput report để định lượng mức tiết kiệm LE/M9K hoặc khẳng định phương án tối ưu tuyệt đối.

---

# 5. Phương án được chọn

| Phương án | Nhận xét |
|---|---|
| Chỉ sửa tên plan và giữ toàn bộ nội dung còn lại | Không giải quyết scan permit, power-on reroute, reset replay và descriptor lifetime |
| Giữ sáu plane/portable core, làm rõ transactions/safety/data và giới hạn V1 | **Được chọn**; bảo toàn thiết kế đúng, giải quyết điểm mơ hồ, không mở rộng application scope |
| Đổi sang FPGA lớn ngay | Có thể giải quyết pin/LE sau đo, nhưng không sửa contract/safety semantics |

Kiến trúc đề xuất vẫn là EP4CE6 prototype → EP4CE10 candidate + external SDRAM + LA/Scope2CH/DDS2CH. Không bỏ mục tiêu instrument; chỉ tách target khỏi capability thực và đưa final-interface feasibility lên trước PCB freeze.

---

# 6. Những nội dung không được tự suy ra từ review này

Không có cơ sở để công bố đã pass current v3.1 schema, đã compile RTL, đã fit EP4CE10E22C8N, đã đạt tần số ADC/DAC/SDRAM cụ thể hoặc đã chứng minh an toàn với mọi unknown IC.

Không có kết luận “v3.1 chắc chắn sai” chỉ vì nó chưa được cung cấp. Khác tên plan có thể là migration hợp lệ; phải đối chiếu schema mới biết. Tương tự, một điểm chưa ghi trong Markdown có thể đã được xử lý trong RTL/PCB chưa cung cấp; review chỉ yêu cầu đưa nó vào architectural contract và bằng chứng kiểm chứng.

Sơ đồ cũ của [S1, §9.4] có bước compare/reference trước compile và câu “nếu topology tương đương thì cho phép”. Báo cáo không suy điều kiện đủ đó thành điều kiện cần. Quy tắc rõ ràng tại [S1, §24, §27 và ADR-LAB-001] vẫn là topology mismatch không tự chặn run. Đây là cách đọc baseline được công bố, không tự sửa authority đã superseded.

---

# 7. Điều kiện chấp nhận bản kiến trúc thay thế

Revision 2.1 đã tổ chức lại nội dung thành §0–36, bổ sung 22 hàng contract traceability, 22 acceptance properties và 9 nhóm closure gate. Các thay đổi mới được đánh dấu là đề xuất, không mô tả implementation có sẵn.

Để chuyển từ **architecture proposal** sang **implementation authority**, cần đóng G-01 và chấp nhận các quyết định hardware trong ADR. Để freeze hardware/capability, cần evidence cho các gate điện, pin/clock, RTL, memory, measurement và integrated bench tương ứng.

**Kết luận kỹ thuật:** không cần phá bỏ v2; cần thay cách đặc tả từ danh sách khối chức năng sang các giao dịch, quyền cấp năng lượng và vòng đời dữ liệu có điều kiện kiểm chứng rõ ràng. Bản sửa đi kèm thực hiện việc đó trong phạm vi Hardware FPGA.
