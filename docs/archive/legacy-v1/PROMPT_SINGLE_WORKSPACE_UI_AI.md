SUPERSEDED
Do not use as current implementation authority.
Current authority: docs/ARCHITECTURE.md

# PROMPT — THIẾT KẾ LẠI GIAO DIỆN SINGLE WORKSPACE CHO net*CIRCUIT Remote

> Trạng thái 2026-10-09: Phase 1 shell và Phase 2 interactive workspace đã được triển khai; xem `docs/DEV_LOG.md`, `docs/SOURCE_ANALYSIS_INTERACTIVE_WORKSPACE.md` và báo cáo browser Phase 2. Giữ prompt làm yêu cầu kiến trúc/lịch sử; không migrate lại shell hoặc phục hồi navigation. Task tiếp theo là Phase 3 simulator/event/clock/model và output/capture thật. Hex Editor hiện chỉnh local memory image, không phải physical RAM/capture. Các mục engine/thiết bị đo bên dưới vẫn là hướng phát triển.

## Vai trò

Bạn là **Senior Frontend Architect + Vue 3/TypeScript/Three.js Engineer + UX Engineer cho phần mềm kỹ thuật điện tử**.

Bạn phải phân tích source code trong Project hiện tại và thiết kế lại frontend theo kiến trúc **Single Workspace**.



Không được xem đây là website dashboard nhiều trang.

Đây là một **virtual electronics workbench chạy trên Web**, có workflow gần với các phần mềm mô phỏng/lắp mạch dạng CRUMB, dựa trên 5 ảnh reference người dùng cung cấp.

---

## 1. Bắt buộc đọc trước khi sửa code

Đọc theo thứ tự:

```text
docs/CONTEXT.md
docs/ARCHITECTURE.md
docs/ROADMAP.md
docs/DEV_LOG.md
docs/superpowers/specs/2026-10-09-single-workspace-ui-design.md
apps/web/README.md
```

Sau đó đọc toàn bộ frontend liên quan:

```text
apps/web/src/App.vue
apps/web/src/router/index.ts
apps/web/src/pages/
apps/web/src/components/
apps/web/src/stores/
apps/web/src/services/
apps/web/src/types/
apps/web/src/style.css
apps/web/tests/
tests/frontend/
```

Không được viết lại project từ đầu trước khi hiểu code đang có.

---

## 2. Hiện trạng source cần nhận biết

Source hiện tại vẫn theo thiết kế cũ:

```text
Dashboard
Laboratory
Circuits
Stations
Experiments
Settings
```

`App.vue` đang có RouterLink/RouterView và main navigation.

`LaboratoryPage.vue` đang ghép:

```text
ComponentLibrary
LabWorkspace
PropertiesInspector
InstrumentDock
```

Đây là **legacy UI đã bị superseded**.

Không được tiếp tục mở rộng thiết kế này.

Tuy nhiên:

```text
Pinia stores
typed API
WebSocket
status mapping
tests
```

là những phần có thể tái sử dụng.

---

## 3. Mục tiêu giao diện mới

Khi mở ứng dụng:

```text
/
```

phải vào trực tiếp **một giao diện duy nhất**.

Không hiển thị menu:

```text
Dashboard
Circuits
Stations
Experiments
Settings
```

Không bắt người dùng rời workspace để thao tác lab.

---

## 4. Hình ảnh tham chiếu

Nếu 5 ảnh sau được cung cấp trong phiên làm việc, hãy phân tích chúng bằng vision trước khi code:

```text
interface_1.png
interface_2.png
interface_3.png
interface_4.png
interface_5.png
```

Các ảnh là **reference về bố cục, density và workflow**, không phải yêu cầu sao chép pixel.

### Reference 1

Rút ra:

- title/app bar trên cùng;
- component ribbon ngang;
- tool rail dọc bên trái;
- breadboard 3D chiếm gần toàn bộ màn hình;
- Oscilloscope là cửa sổ nổi;
- bottom simulation status bar.

### Reference 2

Rút ra:

- Function Generator là floating window;
- người dùng vẫn nhìn thấy circuit phía sau;
- generator có waveform preview + controls.

### Reference 3

Rút ra:

- circuit sequential/shift register;
- Oscilloscope có thể mở với cấu hình kênh khác nhau;
- instrument UI không cần chiếm một dock cố định.

### Reference 4

Rút ra:

- Component/IC Information là floating panel;
- Memory Hex Editor là floating window;
- memory editing không cần route/page riêng.

### Reference 5

Rút ra:

- workspace phải chứa được circuit phức tạp;
- display/LCD là component trong scene;
- Signal Monitor/Logic Analyzer là floating tool;
- nhiều trace digital hiển thị đồng thời.

---

## 5. Quan hệ với CRUMB

Thiết kế workflow **gần với CRUMB** ở các điểm:

```text
single workbench
component palette/ribbon
direct manipulation
3D breadboard/circuit scene
wire interaction
simulation controls
floating instruments
component inspection
```

Nhưng:

- không sao chép source code của CRUMB;
- không lấy asset/logo/icon độc quyền;
- không clone pixel-by-pixel;
- vẫn dùng thương hiệu `net*CIRCUIT Remote`;
- phải phù hợp kiến trúc Vue 3 + TypeScript + Three.js hiện tại.

---

## 6. Layout bắt buộc

Thiết kế theo cấu trúc:

```text
┌────────────────────────────────────────────────────────────────────┐
│ Logo | New | Open | Save | Undo | Redo                           │
├────────────────────────────────────────────────────────────────────┤
│ COMPONENT RIBBON                                                   │
│ Structure | Passive | Active | Output | Input | Logic ICs |       │
│ Arithmetic ICs | Memory | Display | Instruments | Notation        │
├────────┬─────────────────────────────────────────────────┬─────────┤
│ TOOL   │                                                 │ VIEW /  │
│ RAIL   │               CIRCUIT WORKSPACE                 │ OVERLAY │
│        │                                                 │         │
│ Select │           Three.js 3D Scene                     │         │
│ Wire   │                                                 │         │
│ Move   │                                                 │         │
│ Rotate │                                                 │         │
│ Delete │                                                 │         │
│ Scope  │                                                 │         │
│ Probe  │                                                 │         │
├────────┴─────────────────────────────────────────────────┴─────────┤
│ ▶ Simulation | status | Freq | Step | Components | Wires          │
└────────────────────────────────────────────────────────────────────┘
```

Workspace phải chiếm phần lớn diện tích.

Không tạo sidebar lớn bên phải/trái nếu không cần.

---

## 7. App/File Bar

Các action đầu tiên:

```text
New
Open
Save
Undo
Redo
```

Có tooltip.

Disable đúng state nếu chưa thể dùng.

Không fake nút Windows minimize/maximize/close trong browser.

---

## 8. Component Ribbon

Thay `ComponentLibrary.vue` kiểu sidebar bằng component ribbon phía trên.

Nhóm tối thiểu:

```text
Interaction
Structure
Passive
Active
Output
Input
Logic ICs
Arithmetic ICs
Memory
Display
Embedded / Controller
Instruments
Notation
```

Cho phép dropdown/popup palette.

Phải metadata-driven.

Không hard-code toàn bộ logic component bên trong template.

---

## 9. Các component cần chuẩn bị

Ít nhất UI/palette phải có khả năng biểu diễn:

```text
Breadboard / board
Resistor
Capacitor
LED
Push button
Toggle switch
DIP switch
Clock
7-segment
Logic IC
Adder module / arithmetic IC
Multiplier module / arithmetic block
Counter
Flip-Flop
Shift Register
Memory / EEPROM-like model
LCD/display
Label
Probe
```

Đây là UI/device-library architecture.

Không được tự bịa thông số điện hoặc pinout nếu metadata chưa có.

---

## 10. Tool Rail

Tạo tool rail bên trái:

```text
Select
Wire
Move
Rotate
Delete
Scope
Probe
```

Có active state.

Tool selection nằm trong `workspace` store.

Không để mỗi component tự quản lý mode tương tác riêng.

---

## 11. Workspace

Refactor `LabWorkspace.vue` thành/hoặc thay bởi một workspace dành cho Three.js.

Có thể đặt tên:

```text
CircuitWorkspace3D.vue
```

hoặc tên tương đương phù hợp project.

Workspace chuẩn bị cho:

```text
drag/drop
select
move
rotate
delete
wire
unwire
zoom
pan/orbit
picking
hover
labels
snap
undo/redo
```

Trong shell migration có thể chưa implement toàn bộ engine, nhưng boundary phải đúng.

---

## 12. Floating Window Manager

Không dùng bottom `InstrumentDock` làm UX chính.

Tạo hệ thống floating window chung:

```text
FloatingWindow
FloatingWindowManager
```

Yêu cầu:

```text
open
close
drag
bring-to-front
z-index
bounded position
initial placement
```

Resize/minimize có thể làm ở bước kế tiếp nếu cần.

Không copy/paste drag code vào từng instrument.

---

## 13. Oscilloscope Window

Tạo UI shell gần tinh thần reference:

- waveform grid;
- channel colors;
- time/div;
- channel scale;
- trigger controls;
- acquire/run controls;
- measurements area.

Ở Simulation-first:

- dùng simulated waveform nếu contract simulator đã hỗ trợ;
- nếu data chưa có, dùng trạng thái empty/demo được đánh dấu rõ;
- không giả rằng physical analog oscilloscope đã hoạt động.

Không hard-code ADC.

---

## 14. Function Generator Window

Tạo shell:

```text
Waveform:
Sine
Square
Triangle
Pulse

Frequency
Amplitude
Offset
Duty Cycle
Output On/Off
```

Physical analog implementation chưa tồn tại.

Do not claim real analog output.

---

## 15. Signal Monitor / Logic Analyzer

Floating window có:

```text
channel list
digital traces
time scale
run/pause
trigger placeholder/contract
```

Dùng Canvas/SVG phù hợp hơn DOM-div cho waveform.

---

## 16. IC/Component Information Window

Khi người dùng inspect component:

- tên;
- type;
- description;
- pin labels;
- supported simulation information;
- metadata.

Data phải đọc từ device-library/model.

Không viết datasheet “tưởng tượng”.

---

## 17. Memory Hex Editor

Đối với memory component được simulator hỗ trợ:

- open editor;
- address column;
- byte cells;
- load/save data contract;
- apply changes;
- validation.

Không gắn Hex Editor cho IC không có memory model.

---

## 18. Status Bar

Bottom status bar:

```text
Run / Stop
Simulation state
Mode: Simulation / Hardware
Frequency
Time Step
Components count
Wires count
Connection/Fault indicator
```

Không hiển thị fabricated current/voltage.

---

## 19. Router Migration

Mục tiêu user-facing cuối:

```text
/ -> SingleWorkspace
```

Có thể giữ Vue Router tạm thời để giảm rủi ro.

Nếu giữ:

```text
/ -> SingleWorkspace
legacy route -> redirect /
unknown route -> redirect /
```

Sau khi test PASS:

- remove legacy route navigation;
- delete unused page components nếu không còn reference.

Không cần giữ multi-page architecture chỉ vì Vue Router đã tồn tại.

---

## 20. Store Migration

Giữ:

```text
circuit.ts
workspace.ts
station.ts
experiment.ts
instrument.ts
ui.ts
```

nhưng refactor responsibility phù hợp Single Workspace.

Ví dụ `ui.ts`:

```text
activeRibbonGroup
openWindows
windowZOrder
connectionState
viewportOverlayState
```

`instrument.ts`:

```text
oscilloscope config/state
generator config/state
signal monitor config/state
```

Không nhét Three.js object trực tiếp vào serializable Circuit Graph.

---

## 21. Three.js Architecture

Không viết toàn bộ Three.js logic trực tiếp trong `CircuitWorkspace3D.vue`.

Tách manager/service:

```text
three/
├── SceneManager
├── CameraController
├── PickingController
├── ComponentRenderer
├── WireRenderer
└── disposal helpers
```

Vue component quản lý lifecycle và bridge state.

Scene object không được trở thành nguồn sự thật của Circuit Graph.

Nguồn sự thật logic vẫn là Circuit Graph.

---

## 22. Electrical Identity

Phải giữ:

```text
visual position
!=
physical contact
!=
electrical node
!=
logical net
!=
routing channel
!=
FPGA GPIO
```

Không dùng coordinate làm electrical node ID.

---

## 23. Visual Style

Mục tiêu:

```text
technical
electronics
desktop-instrument
dense but readable
dark graphite/blue work surface
high-contrast signals
compact controls
professional
```

Có thể dùng signal colors khác nhau cho waveform/wire.

Không:

```text
marketing landing page
large dashboard cards
glassmorphism everywhere
oversized whitespace
decorative animations
random gradients
```

---

## 24. Performance

Đặc biệt lưu ý:

- không rebuild toàn scene khi Pinia state nhỏ thay đổi;
- dispose Three.js resources;
- tách render loop khỏi Vue render;
- throttle raycasting khi cần;
- waveform render độc lập;
- instancing cho geometry lặp nhiều nếu cần;
- component library tải asset theo nhu cầu.

---

## 25. Responsive Policy

Ứng dụng ưu tiên desktop/laptop.

Không biến UI thành stack mobile kiểu website.

Khi viewport hẹp:

- ribbon có horizontal scroll hoặc compact groups;
- floating windows tự clamp;
- tool rail vẫn truy cập được;
- workspace không biến mất.

Mobile không phải mục tiêu chính của V1.

---

## 26. Không được thay backend/hardware architecture

Task UI này không được tự đổi:

```text
Raspberry Pi 5
FastAPI
Hardware Service
gRPC
VirtualHardwareStation
PhysicalHardwareStation
EP4CE6 prototype
EP4CE10 final
64 MB SDR SDRAM
```

Không đưa hardware register vào frontend.

---

## 27. Testing bắt buộc

Trước khi implement feature:

```text
test RED
implement
test GREEN
regression
```

Bổ sung test cho:

```text
root opens workspace
legacy navigation absent
toolbar actions
active tool
ribbon interaction
floating-window open/close/z-order
window position clamp
store migration
API/WebSocket boundary unchanged
```

Chạy:

```bash
cd apps/web
npm test
npm run build

cd ../..
python -m pytest -q tests/frontend
```

Nếu project có full regression phù hợp, chạy thêm.

---

## 28. Browser verification

Kiểm tra ít nhất:

```text
1920x1080
1440x900
1366x768
1280x720
```

Xác nhận:

- không body horizontal overflow ngoài ribbon chủ động scroll;
- workspace không bị che hoàn toàn;
- floating window không mắc kẹt ngoài viewport;
- ribbon/tool rail không che circuit;
- mở Scope/Generator vẫn thao tác được workspace;
- keyboard/focus cơ bản hoạt động.

---

## 29. Tài liệu cần cập nhật sau khi code hoàn tất

```text
docs/ROADMAP.md
docs/DEV_LOG.md
docs/CHANGELOG.md
apps/web/README.md
```

Chỉ đánh dấu:

```text
Single Workspace migration = COMPLETE
```

khi test/build/browser verification thực sự PASS.

---

## 30. Cách báo cáo cuối task

Báo:

```text
1. Source analysis
2. Files changed
3. Legacy files removed/redirected
4. New components
5. Store changes
6. Tests written
7. Test results
8. npm run build result
9. Browser verification
10. Known limitations
11. Next recommended task
```

Nếu chưa verify được:

```text
IMPLEMENTED — NOT VERIFIED
```

Không nói DONE.

---

## 31. Definition of Done cho Single Workspace Shell

Chỉ DONE khi:

```text
/ mở Single Workspace
không còn visible multi-page navigation
component ribbon hoạt động
tool rail hoạt động
workspace chiếm vùng chính
status bar hoạt động
floating window framework hoạt động
Scope/Generator/Signal Monitor shells mở được
old page flow không còn là workflow chính
typed API/WebSocket vẫn hoạt động
npm test PASS
npm run build PASS
frontend boundary tests PASS
browser check PASS
DEV_LOG updated
```

---

## 32. Không làm quá phạm vi trong shell task

Không cần hoàn thành ngay:

```text
full realistic component library
full simulator
FPGA
SPI
SDRAM
routing PCB
real ADC/DAC
production analog Oscilloscope
production analog Generator
multi-user scheduler
```

Hãy xây đúng shell/architecture trước, sau đó phát triển Phase 2 theo từng subsystem.

---

# KẾT LUẬN

Hãy biến net*CIRCUIT Remote từ một Web app nhiều trang thành một **Single Workspace virtual electronics laboratory**.

Trọng tâm UX:

```text
CHỌN LINH KIỆN
    ↓
KÉO THẢ VÀO WORKSPACE
    ↓
NỐI DÂY
    ↓
CHẠY MÔ PHỎNG
    ↓
MỞ SCOPE / GENERATOR / MONITOR NGAY TRÊN WORKSPACE
    ↓
KHÔNG RỜI KHỎI BÀN THÍ NGHIỆM
```

Đây là nguyên tắc cao nhất của frontend mới.
