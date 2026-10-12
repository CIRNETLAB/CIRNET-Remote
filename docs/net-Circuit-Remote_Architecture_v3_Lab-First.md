# net*CIRCUIT Remote — Kiến trúc chính thức được đề xuất (Lab-First v3)

> **Bản cập nhật kiến trúc Lab-First v3**  
> Bản này kế thừa toàn bộ v2 và thay đổi triết lý Physical Lab theo hướng:
>
> **Computer checks SAFETY → safe circuit is allowed to run → physics shows whether the student is correct.**
>
> Các quyết định chính:
> 1. Tự động dò kết nối/vị trí vật lý bằng **Active Electrical Topology Discovery**.
> 2. `TopologyVerificationResult` chỉ dùng để chẩn đoán/chấm bài, **không phải cổng chặn Run**.
> 3. Chỉ `SafetyVerificationResult` và khả năng route/execute an toàn mới có quyền chặn Physical Run.
> 4. IC sai, IC ngoài thư viện, thiếu linh kiện hoặc wiring sai nhưng vẫn nằm trong **electrical safety envelope** được phép chạy ở `RUN_NORMAL` hoặc `RUN_GUARDED`.
> 5. Kết quả đúng/sai được xác định sau khi chạy bằng **FunctionalVerificationResult** dựa trên tín hiệu thực tế FPGA đo được.
> 6. Hỗ trợ hai cách resolve IC: **AUTO_DISCOVERY** và **INSTRUCTOR_PROFILE**, với **HYBRID** là chế độ khuyến nghị V1.
> 7. Mini PC hỗ trợ Virtual Digital + Virtual Analog; Physical FPGA V1 chỉ chạy mạch số.
> 8. EP4CE10 quản lý Oscilloscope 2CH + Function Generator 2CH + Logic Analyzer, sử dụng ADC/DAC/AFE/SDRAM bên ngoài.
> 9. Hỗ trợ 30–50 user session; Physical V1 dùng scheduler + execution slot.


## 1. Mục tiêu kiến trúc

**net*CIRCUIT Remote** được định hướng là một nền tảng **Remote Electronics Laboratory** theo mô hình **Web-CAD / Workbench**, phát triển theo hướng **digital-first nhưng mixed-signal-ready**.

Ở tầng Mini PC, kiến trúc phần mềm phải hỗ trợ được cả:
- **Mạch số**.
- **Mạch tương tự**.
- Khả năng mở rộng mixed-signal trong tương lai.

Ở tầng phần cứng hiện tại:
- FPGA/Physical Hardware phiên bản V1 chỉ chạy **mạch số**.
- Oscilloscope và Function Generator vẫn được hỗ trợ như các **instrument** sử dụng ADC/DAC/AFE bên ngoài FPGA.
- Khi phát triển thêm Physical Analog Hardware trong tương lai, kiến trúc Mini PC và frontend không phải thay đổi nền tảng.

Kiến trúc chính thức được đề xuất theo nguyên tắc:

> **Web-first, Simulation-first, Contract-driven, Virtual-to-Physical, Safety-gated, Lab-first**

## 1.1 Triết lý phòng thí nghiệm

Hệ thống không được biến thành một “bộ kiểm tra đáp án trước khi chạy”.

Triết lý chính thức:

```text
Computer checks SAFETY
        ↓
Safe circuit is allowed to run
        ↓
Real hardware / physics produces the result
        ↓
System observes, compares and teaches
```

Do đó phải tách rõ:

```text
SAFETY != CORRECTNESS
```

- **Safety failure** → chặn Run.
- **Wrong circuit / wrong IC / unknown IC / missing component / topology mismatch** → không mặc định chặn Run nếu vẫn an toàn.
- **Routing impossible hoặc hardware capability không đáp ứng** → chặn vì không thể thực thi, không phải vì bài làm sai.
- Kết quả học tập được quyết định bằng **measured behavior**, không chỉ bằng topology.

Mục tiêu cốt lõi:

- Dùng **Circuit Graph** làm nguồn sự thật duy nhất của thiết kế.
- Hoàn thiện **Virtual Hardware** trước.
- Giữ chung workflow giữa Virtual và Physical.
- Khi chuyển sang phần cứng thật, frontend không cần viết lại.
- Mini PC làm Edge Server / Controller.
- FPGA xử lý các tác vụ deterministic và timing-critical.
- Routing hardware kết nối FPGA tới IC logic thật.
- Kiến trúc đủ mở rộng cho nhiều user, nhiều station và nhiều loại instrument về sau.

---

# 2. Cấu hình hệ thống mục tiêu

## 2.1 Edge Server

Sử dụng Mini PC:

- CPU: **Intel Xeon W-1370**
- RAM: **16 GB**
- SSD: **256 GB**
- Hệ điều hành khuyến nghị: Linux
- Vai trò:
  - Web Server
  - API Backend
  - Circuit Validation
  - Circuit Compiler
  - Digital Simulator
  - Experiment Manager
  - Station Manager
  - Database
  - Hardware Service
  - FPGA communication
  - Waveform processing
  - Session / lease / queue management
  - Storage metadata

## 2.2 Client

Trình duyệt của người dùng chịu trách nhiệm:

- Render 3D bằng Three.js/WebGL.
- Hiển thị circuit workbench.
- Tương tác kéo thả linh kiện.
- Điều khiển instrument UI.
- Hiển thị waveform, LED state, logic state.
- Gửi thao tác người dùng đến backend.

> Mini PC không render 3D thay cho toàn bộ client.

---

# 3. Kiến trúc tổng thể

Kiến trúc chính thức:

> **Web SPA + Modular Monolith Backend + Isolated Hardware Service + Contract-Driven FPGA**

```text
┌───────────────────────────────────────────────────────────────┐
│                         USER BROWSER                          │
│                                                               │
│  Vue 3 + TypeScript + Three.js                               │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────┐ │
│  │ Workbench UI │  │ CircuitGraph │  │ Three.js Scene      │ │
│  │ Instruments  │  │ Editor       │  │ Renderer / Picking  │ │
│  │ Properties   │  │ Undo/Redo    │  │ Gizmo / Wires       │ │
│  └──────┬───────┘  └──────────────┘  └─────────────────────┘ │
└─────────┼─────────────────────────────────────────────────────┘
          │
          │ REST / HTTPS
          │ WebSocket
          ▼
┌──────────────────────── MINI PC ───────────────────────────────┐
│                                                               │
│                         Nginx                                 │
│                           │                                   │
│           ┌───────────────┴───────────────┐                   │
│           ▼                               ▼                   │
│     Static Web Files                  FastAPI                 │
│                                       Backend                 │
│                                           │                   │
│    ┌──────────────────────────────────────┼────────────────┐  │
│    │                                      │                │  │
│    ▼                                      ▼                ▼  │
│ Circuit Domain                    Experiment Manager      Auth │
│ Validation                       Session / Lease          DB   │
│ Compiler                             │                         │
│    │                                 │                         │
│    ├─────────────┐                   │                         │
│    ▼             ▼                   │                         │
│ Virtual       Physical               │                         │
│ Compiler      Compiler               │                         │
│    │             │                   │                         │
│    ▼             ▼                   │                         │
│ Simulator   ExecutionPlan            │                         │
│    │             │                   │                         │
│    └─────────────┴──────────┬────────┘                         │
│                             ▼                                  │
│                       Hardware Service                          │
│                       separate process                         │
│                             │                                  │
│                      gRPC / Protobuf                           │
│                             │                                  │
│                       FPGA Host Driver                          │
│                             │                                  │
└─────────────────────────────┼──────────────────────────────────┘
                              │
                       USB / USB3
                              │
                              ▼
┌───────────────────────────────────────────────────────────────┐
│                            FPGA                               │
│                                                               │
│ Control Engine                                                │
│ Clock / Trigger                                               │
│ Routing Controller                                            │
│ Logic Analyzer                                                │
│ DDS / Generator                                               │
│ Acquisition                                                   │
│ SDRAM Controller                                              │
└───────────────────────┬───────────────────────────────────────┘
                        │
                        ▼
               MUX / CROSSPOINT MATRIX
                        │
                        ▼
               PHYSICAL LOGIC ICs
                        │
                        ▼
                 REAL EXPERIMENT
```

---

# 4. Nguyên tắc kiến trúc bắt buộc

## 4.1 CircuitGraph là nguồn sự thật

```text
CircuitGraph ≠ Three.js Scene
```

Three.js chỉ render trạng thái từ CircuitGraph.

## 4.2 CircuitGraph không phụ thuộc FPGA

```text
CircuitGraph ≠ FPGA Registers
```

Giữa CircuitGraph và FPGA luôn phải có:

```text
Validation
Compiler
ExecutionPlan
Hardware Driver
```

## 4.3 Virtual và Physical dùng chung abstraction

```text
HardwareStation
│
├── VirtualHardwareStation
└── PhysicalHardwareStation
```

Application không được phụ thuộc trực tiếp implementation bên dưới.

## 4.4 Frontend không biết chi tiết phần cứng

Frontend không chứa:

- MUX channel.
- Crosspoint address.
- FPGA register.
- SPI command.
- USB endpoint.
- Physical socket route.

Các thông tin đó thuộc backend/hardware domain.

---

# 5. Circuit Data Model

Circuit được chia thành ba tầng.

```text
DesignGraph
     ↓
ValidatedGraph
     ↓
ExecutionPlan
```

---

# 6. DesignGraph

DesignGraph là mô hình circuit do người dùng trực tiếp chỉnh sửa.

Bao gồm:

```text
Project
Circuit
ComponentInstance
Port
Connection
Property
Position
Rotation
Label
Metadata
```

Dùng cho:

- Save/Open.
- Undo/Redo.
- Circuit editing.
- 3D rendering.
- User interaction.

Ví dụ:

```text
SW1.OUT → AND1.A
AND1.Y  → LED1.IN
```

## 6.1 AssignmentDefinition — mô hình đề bài

Đề bài thực hành được lưu tách khỏi circuit sinh viên.

```text
AssignmentDefinition
│
├── assignmentId
├── title
├── ReferenceDesignGraph?          # tùy chọn
├── ReferenceTopologyGraph?        # có thể được scan từ mạch chuẩn của giảng viên
├── ExpectedComponentSet?          # IC dự kiến dùng trong bài
├── InstructorPinProfiles?         # pin function/profile do giảng viên khai báo
├── LabEndpoints
│   ├── INPUT_SOURCE
│   ├── OUTPUT_SENSE
│   ├── CLOCK
│   ├── VCC
│   ├── GND
│   ├── GENERATOR
│   └── SCOPE
├── ExpectedBehavior?
│   ├── truthTable
│   ├── timingConstraints
│   └── expectedWaveforms
└── AssessmentPolicy
    ├── STRICT_TOPOLOGY
    ├── FUNCTIONAL_ONLY
    └── TOPOLOGY_AND_FUNCTION
```

Giảng viên có thể tạo reference bằng hai cách:

```text
A. Web CAD / logical definition
B. Lắp mạch chuẩn thật → Scan Reference → Confirm → Save ReferenceTopologyGraph
```

Tọa độ vật lý của mạch giáo viên **không phải tiêu chí chấm**.

## 6.2 LabEndpoint — điểm vào/ra cố định của bài thực hành

Để có thể chạy cả khi IC bên trong mạch là sai hoặc ngoài thư viện, hệ thống cần các endpoint vật lý rõ ràng.

Ví dụ:

```text
x  = INPUT_SOURCE
y  = INPUT_SOURCE
d  = OUTPUT_SENSE
b  = OUTPUT_SENSE
VCC/GND = POWER ENDPOINTS
```

FPGA chỉ cần biết endpoint nào được phép drive/sense.  
Nó không bắt buộc phải hiểu toàn bộ chức năng của IC bên trong trước khi cho chạy.

---

# 7. ValidatedGraph

Backend nhận DesignGraph và thực hiện normalize + validate ở tầng logical/schema.

Kiểm tra:

```text
schema validity
component/port references
signal width
net resolution
required metadata
logical consistency
signal-domain compatibility
```

**Không dùng ValidatedGraph để quyết định một Physical Circuit của sinh viên “đúng bài” hay không.**

Đối với Physical Lab:
- linh kiện ngoài thư viện có thể trở thành `OPAQUE_PHYSICAL_COMPONENT`;
- topology mismatch là thông tin chẩn đoán;
- safety được xử lý bởi Safety Verification riêng;
- correctness được đánh giá sau khi chạy.

Ví dụ:

```text
SW1.OUT ───── Net0001 ───── AND1.A
```

ValidatedGraph là logical circuit đã hợp lệ.

---

# 8. ExecutionPlan

ExecutionPlan là output của compiler.

Có hai loại:

```text
VirtualExecutionPlan
PhysicalExecutionPlan
```

## VirtualExecutionPlan

Chứa thông tin phục vụ simulator:

```text
device model mapping
net dependency
event schedule metadata
initial state
timing parameters
```

## PhysicalExecutionPlan

Chứa:

```text
logical-to-physical binding
socket mapping
routing resources
crosspoint route
FPGA resource allocation
instrument channel allocation
```

ExecutionPlan không phải dữ liệu do người dùng chỉnh sửa trực tiếp.

## 8.1 Signal Domain

Circuit Graph phải mô tả loại miền tín hiệu để cùng một kiến trúc Mini PC có thể phục vụ cả digital và analog.

```text
SignalDomain
│
├── DIGITAL
├── ANALOG
├── POWER
├── GROUND
├── CLOCK
└── MIXED
```

Ví dụ:

```text
74HC08.A1     → DIGITAL
LM358.IN+     → ANALOG
VCC           → POWER
GND           → GROUND
CLK           → CLOCK
```

`SignalDomain` là contract ở tầng Circuit/Compiler, không phụ thuộc việc FPGA hiện tại đã hỗ trợ analog hay chưa.

### Trạng thái hỗ trợ

```text
Mini PC Virtual Digital        → SUPPORTED
Mini PC Virtual Analog         → ARCHITECTURALLY SUPPORTED
Physical Digital on FPGA V1    → SUPPORTED TARGET
Physical Analog Routing V1     → NOT SUPPORTED
Physical Analog Future         → ADD NEW HARDWARE CAPABILITY, NO PC ARCHITECTURE REWRITE
```

---

# 9. Domain Separation

## 9.1 Circuit Domain

```text
Circuit Domain
│
├── Project
├── Circuit
├── ComponentInstance
├── ComponentDefinition
├── Port
├── Net
├── Property
└── CircuitMetadata
```

## 9.2 Rendering Domain

```text
Rendering Domain
│
├── SceneObject
├── Transform
├── Mesh
├── Material
├── Camera
├── Selection
└── Gizmo
```

## 9.3 Physical Domain

```text
Physical Domain
│
├── Station
├── HardwareProfile
├── Socket
├── RoutingResource
├── Crosspoint
├── FPGAResource
├── InstrumentChannel
└── CalibrationProfile
```

Ba domain không được trộn lẫn.

## 9.4 Physical Placement & Automatic Topology Discovery

Với breadboard 830 được thiết kế PCB riêng, mỗi nhóm lỗ điện tương đương phải có một `BreadboardNodeID` cố định.

Ví dụ:

```text
A1 ─┐
B1  │
C1  ├── BreadboardNode N001
D1  │
E1 ─┘
```

PCB ánh xạ node này tới hạ tầng scan/routing:

```text
Breadboard Hole
      ↓
BreadboardNodeID
      ↓
Scan Matrix / Sense Front-End
      ↓
Routing Resource
      ↓
FPGA
```

### Phương án được chọn: Active Electrical Topology Discovery

Không yêu cầu sinh viên khai báo vị trí linh kiện thủ công.

Khi người dùng bấm `Run`, hệ thống thực hiện:

```text
SAFE_STATE
   ↓
Disconnect normal drive paths
   ↓
Topology Scan
   ↓
DetectedTopologyGraph
   ↓
Component / Connection Resolution
   ↓
Compare with Reference Circuit
   ↓
ERC
   ↓
Physical Compiler
   ↓
Routing Solver
   ↓
Execute
```

### Các module cần bổ sung

```text
Physical Placement Layer
│
├── BreadboardNodeMap
├── ScanMatrixController
├── SafeStimulusController
├── HighImpedanceSenseEngine
├── DetectedTopologyGraph
├── ComponentSignatureLibrary
├── PlacementResolver
├── TopologyMatcher
└── BoardOccupancyMap
```

### Cơ chế scan đề xuất

1. Đưa toàn bộ station về `SAFE_STATE`.
2. Ngắt các output có thể gây xung đột.
3. Dùng nguồn test giới hạn dòng/điện áp để kích từng node.
4. Dùng ngõ đo trở kháng cao để đọc các node còn lại.
5. Xây dựng graph các kết nối dẫn điện đã phát hiện.
6. Với IC thuộc thư viện hỗ trợ, thực hiện test-vector/signature có kiểm soát để hỗ trợ suy luận loại IC và orientation.
7. Đối chiếu `DetectedTopologyGraph` với sơ đồ tham chiếu.
8. Nếu topology tương đương thì cho phép compile/run dù vị trí vật lý khác hoàn toàn.

### Nguyên tắc so sánh

Không so sánh:

```text
Teacher Position == Student Position
```

Mà so sánh:

```text
Teacher Logical Topology
        ≡
Student Detected Electrical Topology
```

Ví dụ cùng một `U1 = 74HC08`:

```text
Teacher: U1 at E10/F10
Student: U1 at E35/F35
```

vẫn hợp lệ nếu các net điện tương đương.

### Hai chế độ xác định IC / pin function

```text
ComponentResolutionMode
│
├── AUTO_DISCOVERY
├── INSTRUCTOR_PROFILE
└── HYBRID
```

#### AUTO_DISCOVERY

FPGA + Scan Front-End tự quét:
- footprint/location khả dĩ;
- các node dẫn điện;
- orientation khả dĩ;
- pin behavior/signature với IC nằm trong thư viện hỗ trợ.

#### INSTRUCTOR_PROFILE

Giảng viên khai báo:

```text
component type
package
VCC pin
GND pin
input pins
output pins
special pins
```

Vị trí vật lý trên breadboard vẫn có thể do hệ thống scan tự tìm.

#### HYBRID — khuyến nghị cho V1

```text
Expected IC / pin semantics   ← AssignmentDefinition / InstructorProfile
Physical location             ← Automatic Topology Discovery
Orientation / signature       ← scan-assisted
```

Cách này giảm độ khó của “nhận dạng IC hoàn toàn tự động” nhưng vẫn cho sinh viên đặt IC ở vị trí bất kỳ.

### OPAQUE_PHYSICAL_COMPONENT

Nếu phát hiện một linh kiện không resolve được nhưng safety envelope vẫn đảm bảo:

```text
OPAQUE_PHYSICAL_COMPONENT
│
├── physical nodes
├── package/footprint if detectable
├── observed behavior
└── identity = UNKNOWN
```

Linh kiện này **không mặc định làm block Run**.

### Giới hạn kỹ thuật cần giữ rõ

Tự động scan có thể xác định topology dẫn điện tốt, nhưng không được giả định có thể nhận dạng chắc chắn mọi IC tùy ý chỉ bằng đo điện.

Nếu không chắc loại IC nhưng safety đã được đảm bảo:
- đánh dấu `UNKNOWN_COMPONENT`;
- cho phép `RUN_GUARDED` nếu execution endpoints vẫn route được;
- kết quả thật quyết định đúng/sai.

Nếu không thể xác định **an toàn điện**:
- trả `SAFETY_INDETERMINATE`;
- chặn Run cho đến khi safety được giải quyết.

Không được dùng `AMBIGUOUS_TOPOLOGY` như lý do tự động chặn nếu ambiguity không ảnh hưởng safety hoặc khả năng route endpoint.

---

# 10. Component Library

Mỗi component definition chứa:

```text
identity
display metadata
logical ports
logic model
electrical constraints
3D asset
physical package
pin mapping
simulation model
```

Ví dụ:

```text
74HC08
│
├── logic model
├── DIP14 package
├── pins
├── power pins
├── simulation model
└── GLB model
```

Routing resource không lưu trong component definition.

Routing thuộc Station / Hardware Profile.

---

# 11. Frontend Architecture

Frontend sử dụng:

```text
Vue 3
TypeScript
Vite
Pinia
Three.js
```

Kiến trúc module:

```text
Web Application
│
├── Workspace Shell
├── Circuit Editor
├── Component Library UI
├── 3D Renderer
├── Instrument UI
├── Project Manager
├── Property Inspector
├── Toolbar / Tool State
├── API Client
└── WebSocket Client
```

---

# 12. Frontend State Management

Phân chia state:

```text
UI State
    Pinia

Circuit State
    CircuitGraph Engine

Renderer State
    SceneManager

Remote State
    API / WebSocket Client

Hardware State
    Server authoritative
```

Pinia chỉ quản lý UI/application state.

Không dùng Pinia làm:

- Simulator.
- Database.
- FPGA state machine.
- 3D engine.

---

# 13. 3D Rendering Architecture

Three.js tiếp tục là 3D engine chính.

Các module:

```text
SceneManager
AssetManager
WireLayer
SelectionManager
PickingManager
TransformGizmo
CameraController
PlacementGhost
ViewportController
```

Three.js không phải source of truth.

CircuitGraph thay đổi:

```text
CircuitGraph
    ↓
Scene sync
    ↓
Three.js
```

---

# 14. 3D Asset Pipeline

Pipeline chuẩn:

```text
CAD / Blender
      ↓
GLB
      ↓
Mesh Optimization
      ↓
Meshopt
      ↓
KTX2 / Basis Texture
      ↓
Browser
```

Áp dụng:

- GLB.
- Meshopt.
- KTX2.
- Asset cache.
- Lazy loading.
- InstancedMesh.
- Level of Detail.

---

# 15. 3D Performance Strategy

## Instancing

Các chi tiết lặp lại như breadboard hole sử dụng InstancedMesh.

## Asset Cache

Model cùng loại chỉ tải một lần.

## Lazy Loading

Instrument hoặc component chưa dùng thì chưa tải model.

## LOD

```text
near camera → high detail
far camera  → low detail
```

## Renderer isolation

3D renderer không được chứa logic simulation hoặc hardware logic.

---

# 16. Undo / Redo

Giai đoạn đầu tiếp tục sử dụng snapshot history có giới hạn.

Quy tắc:

- Một thao tác drag hoàn chỉnh tương ứng một history entry.
- Không tạo history liên tục theo mỗi frame.
- Giới hạn số snapshot.
- Giới hạn dung lượng history.

Khi circuit lớn mới chuyển sang command-based history.

---

# 17. Backend Architecture

Backend sử dụng:

> **FastAPI Modular Monolith**

Module:

```text
Backend
│
├── Auth
├── Project Service
├── Circuit Service
├── Validation Service
├── Simulation Service
├── Experiment Manager
├── Station Manager
├── Capture Manager
├── Persistence
├── WebSocket Gateway
└── Hardware Service Client
```

Không tách full microservices trong V1.

---

# 18. API Communication

Browser ↔ Backend:

```text
REST
+
WebSocket
```

## REST

Dùng cho:

```text
authentication
projects
circuits
save/open
station info
experiment creation
configuration
metadata
```

## WebSocket

Dùng cho:

```text
simulation events
logic states
LED updates
experiment state
hardware telemetry
logic analyzer results
oscilloscope capture
```

---

# 19. Hardware Service

Hardware Service chạy dưới process riêng.

```text
FastAPI
   │
   │ gRPC
   ▼
Hardware Service
   │
   ▼
PhysicalHardwareStation
   │
   ▼
FPGA Driver
   │
   ▼
Transport
   │
   ▼
FPGA
```

Mục tiêu:

- Cách ly hardware failure.
- Quản lý driver.
- Quản lý protocol.
- Quản lý safety.
- Không để lỗi USB/FPGA làm chết API.

---

# 20. HardwareStation Abstraction

Interface logic:

```text
get_capabilities()
validate_configuration()
apply_circuit()
set_input()
configure_clock()
configure_generator()
configure_trigger()
arm_capture()
run()
stop()
read_capture()
safe_state()
reset()
```

Implementation:

```text
HardwareStation
│
├── VirtualHardwareStation
└── PhysicalHardwareStation
```

Experiment Manager chỉ giao tiếp qua abstraction này.

---

# 21. Simulator Architecture

Mini PC sử dụng kiến trúc simulator kép nhưng cùng contract.

```text
ValidatedGraph
      │
      ├───────────────┐
      │               │
      ▼               ▼
Digital Compiler   Analog Compiler
      │               │
      ▼               ▼
Discrete Event     SPICE Adapter
Simulator          / Analog Engine
      │               │
      └───────┬───────┘
              ▼
      Unified Result Model
```

## 21.1 Digital Simulation

Sử dụng:

> **Server-side Python Discrete Event Simulation**

Không dùng fixed timestep toàn hệ thống.

```text
input change
    ↓
event
    ↓
device evaluate
    ↓
propagation delay
    ↓
output event
    ↓
dependent devices
```

Ví dụ:

```text
t = 0 ns
SW1 = 1

t = 8 ns
AND1.Y = 1

t = 8 ns
LED1 = ON
```

## 21.2 Analog Simulation

Kiến trúc Mini PC phải có interface:

```text
AnalogSimulationEngine
```

Implementation khuyến nghị:

```text
SPICE-compatible adapter
```

Luồng:

```text
ValidatedGraph
      ↓
Analog Compiler
      ↓
SPICE Netlist / Analog Model
      ↓
AnalogSimulationEngine
      ↓
Waveform
      ↓
Unified Result Model
```

Không tự viết một SPICE solver hoàn chỉnh trong V1 nếu không có nhu cầu nghiên cứu riêng về numerical solver.

## 21.3 Mixed-Signal Coordinator

Khi cần mixed-signal trong tương lai:

```text
Digital Simulator
       │
       ├── Digital-to-Analog Bridge
       │
       └── Analog-to-Digital Bridge
                 │
                 ▼
          Analog Simulator
```

Đây là mở rộng ở Mini PC, không làm thay đổi frontend hoặc CircuitGraph contract.

---

# 22. Simulation Modules

```text
Simulation
│
├── Simulation Manager
├── Worker Pool
│
├── Digital
│   ├── Event Scheduler
│   ├── Net Resolver
│   ├── Device Model Registry
│   ├── Clock Engine
│   ├── Digital State Engine
│   └── Timing Model
│
├── Analog
│   ├── Analog Compiler
│   ├── SPICE Adapter
│   └── Analog Waveform Adapter
│
├── Mixed-Signal Coordinator
│
├── Virtual Generator
├── Virtual Oscilloscope
├── Virtual Logic Analyzer
└── Waveform Builder
```

### Simulation Worker Model

Để phục vụ 30–50 user:

```text
FastAPI
   ↓
Simulation Manager
   ↓
Process Worker Pool
   ├── Worker 1
   ├── Worker 2
   ├── ...
   └── Worker N
```

CPU-bound simulation không chạy trực tiếp trong event loop của FastAPI.

---

# 23. Virtual Hardware Flow

```text
User
 ↓
Circuit Editor
 ↓
DesignGraph
 ↓
Backend
 ↓
Validation
 ↓
ValidatedGraph
 ↓
Signal Domain Dispatch
 ├───────────────┐
 ↓               ↓
Digital       Analog
Compiler      Compiler
 ↓               ↓
Discrete      SPICE /
Event Sim     Analog Engine
 └───────┬───────┘
         ↓
VirtualHardwareStation
         ↓
Unified Result Model
         ↓
WebSocket
         ↓
Browser Instruments
```

Pipeline Mini PC này được thiết kế ngay từ đầu để không phải thay đổi kiến trúc nền khi bổ sung physical analog hardware về sau.

---

# 24. Physical Hardware Flow — Lab-First

Phiên bản phần cứng hiện tại chỉ thực thi **mạch số**, nhưng Physical Run dùng triết lý:

```text
SAFETY-GATED
NOT CORRECTNESS-GATED
```

Luồng chính:

```text
Student presses RUN
        ↓
Experiment Scheduler / Lease
        ↓
SAFE_STATE
        ↓
Automatic Electrical Topology Discovery
        ↓
DetectedTopologyGraph
        │
        ├───────────────┐
        │               │
        ▼               ▼
Safety Verification   Topology Verification
        │               │
        ▼               ▼
SafetyVerification    TopologyVerificationResult
Result                  (diagnostic only)
        │               │
        └───────┬───────┘
                ▼
         ExecutionDecision
        ┌───────┴─────────┐
        │                 │
   BLOCK_SAFETY      RUN / RUN_GUARDED
        │                 │
        ▼                 ▼
 show safety fault   Physical Compiler
                          ↓
                     Routing Solver
                          ↓
                  PhysicalExecutionPlan
                          ↓
                 Guarded Power-Up
                          ↓
                PhysicalHardwareStation
                          ↓
                         FPGA
                          ↓
                Digital Routing Fabric
                          ↓
                 Real Student Circuit
                          ↓
              Capture / Observe Signals
                          ↓
                Functional Verification
                          ↓
              FunctionalVerificationResult
                          ↓
                Unified Result Model
                          ↓
                  WebSocket / Binary
                          ↓
                         UI
```

## 24.1 Điều gì được phép chặn Run?

Chỉ các nhóm sau:

```text
A. UNSAFE
   - VCC-GND short
   - hazardous output-output conflict
   - overvoltage
   - overcurrent
   - unsafe power polarity
   - unsafe drive conflict
   - protection fault

B. UNEXECUTABLE
   - required LabEndpoint cannot be routed
   - station capability insufficient
   - hardware unavailable
   - required resource conflict
```

Không chặn chỉ vì:

```text
wrong IC
unknown IC
missing IC
extra IC
wrong but safe wire
topology mismatch
unexpected safe connection
```

## 24.2 Physical Analog Future

Khi phần cứng analog được phát triển về sau:

```text
DetectedTopologyGraph
      ↓
Analog Safety Verification
      ↓
Analog Physical Compiler
      ↓
Analog Routing Profile
      ↓
Future Physical Analog Hardware
```

Mini PC vẫn giữ các abstraction hiện có.

---

# 25. Physical Compiler

Physical Compiler phiên bản V1 xử lý **digital physical execution**.

Đầu vào không chỉ có logical graph mà còn có topology thực tế đã tự dò:

```text
ValidatedGraph
      +
DetectedTopologyGraph
      +
HardwareProfile
      ↓
Physical Compiler
```

Physical Compiler chịu trách nhiệm:

```text
logical component
        ↓
resolved physical placement
        ↓
breadboard electrical node
        ↓
physical pin
        ↓
routing resource
        ↓
FPGA channel
```

Ví dụ:

```text
74HC08.Y1
→ socket U3 pin 3

LED1.IN
→ LED channel 7
```

---

# 26. Routing Solver

Routing Solver giải bài toán constrained graph routing.

Đầu vào:

```text
logical nets
hardware topology
available routing resources
electrical constraints
reserved resources
```

Đầu ra:

```text
RoutingPlan
```

Thuật toán nền:

- BFS.
- Dijkstra.
- Backtracking.
- Resource reservation.

Mục tiêu:

```text
valid route
+
no conflict
+
electrical safety
+
reasonable route length
```

---

# 27. Verification & Execution Policy Architecture

Kiến trúc v3 tách bốn kết quả độc lập.

## 27.1 SafetyVerificationResult

```text
SafetyVerificationResult
│
├── status
│   ├── SAFE
│   ├── UNSAFE
│   └── INDETERMINATE
│
├── powerShorts[]
├── hazardousDriveConflicts[]
├── overCurrentRisks[]
├── invalidVoltageRisks[]
├── polarityErrors[]
├── protectionFaults[]
└── notes[]
```

Quy tắc:

```text
SAFE          → có thể xét RUN / RUN_GUARDED
UNSAFE        → BLOCK_SAFETY
INDETERMINATE → BLOCK_SAFETY mặc định
```

## 27.2 TopologyVerificationResult

Topology verification phục vụ:
- diagnostics;
- grading;
- feedback;
- highlight sai dây;
- so sánh reference.

```text
TopologyVerificationResult
│
├── status
│   ├── MATCH
│   ├── MISMATCH
│   ├── UNKNOWN
│   └── AMBIGUOUS
│
├── matchedComponents[]
├── missingComponents[]
├── unexpectedComponents[]
├── unknownComponents[]
│
├── matchedNets[]
├── missingNets[]
├── unexpectedNets[]
├── shortedNets[]
│
├── orientationDifferences[]
├── pinMappingDifferences[]
└── confidence
```

**TopologyVerificationResult không có quyền tự chặn Run.**

## 27.3 FunctionalVerificationResult

Sau khi circuit thực sự chạy:

```text
FunctionalVerificationResult
│
├── status
│   ├── PASS
│   ├── FAIL
│   ├── PARTIAL
│   ├── NO_RESPONSE
│   └── NOT_EVALUATED
│
├── expectedSignals[]
├── observedSignals[]
├── mismatchedSignals[]
├── expectedTruthTable?
├── observedTruthTable?
├── timingResults?
└── waveformComparisons?
```

Đây là lớp phản ánh “physics shows whether the student is correct”.

## 27.4 ExecutionDecision

```text
ExecutionDecision
│
├── BLOCK_SAFETY
├── BLOCK_UNEXECUTABLE
├── RUN_NORMAL
└── RUN_GUARDED
```

Policy V1:

| Điều kiện | Quyết định |
|---|---|
| VCC–GND short | `BLOCK_SAFETY` |
| Dangerous output-output conflict | `BLOCK_SAFETY` |
| Overcurrent / protection fault | `BLOCK_SAFETY` |
| Required endpoint cannot be routed | `BLOCK_UNEXECUTABLE` |
| Wrong IC nhưng an toàn | `RUN_NORMAL` hoặc `RUN_GUARDED` |
| Unknown IC nhưng safety envelope đảm bảo | `RUN_GUARDED` |
| Missing component nhưng không nguy hiểm | `RUN_GUARDED` |
| Wrong safe wire | `RUN_NORMAL` hoặc `RUN_GUARDED` |
| Topology mismatch | **không tự block** |

## 27.5 Safety Gate và Learning Evaluation phải độc lập

```text
Safety Gate
   decides:
   "Can this physical circuit be energized safely?"

Learning Evaluation
   decides:
   "Did the student's circuit produce the expected behavior?"
```

Không trộn hai câu hỏi này thành một validator duy nhất.

---

# 28. Hardware Safety State Machine

State machine Lab-First:

```text
OFFLINE
   ↓
IDLE
   ↓
RESERVED
   ↓
SAFE_STATE
   ↓
TOPOLOGY_SCAN
   ↓
SAFETY_CHECK
   ├────────────── UNSAFE ──────────────→ FAULT / BLOCKED
   │
   ▼ SAFE
ROUTE_PREPARE
   ↓
GUARDED_POWER_UP
   ↓
READY
   ↓
ARMED
   ↓
RUNNING
   ↓
CAPTURING
   ↓
VERIFYING
   ↓
STOPPING
   ↓
SAFE_STATE
   ↓
RELEASE
   ↓
IDLE
```

`GUARDED_POWER_UP` là bắt buộc để hỗ trợ triết lý “cho sai nhưng an toàn được chạy”.

## 28.1 Electrical Safety Envelope

Hardware V1 nên có các lớp bảo vệ độc lập với việc biết chính xác loại IC:

```text
Power Rail
  ↓
Current Limit / eFuse
  ↓
Current Sense
  ↓
Fast Cutoff
  ↓
Breadboard
```

Mỗi digital drive path nên có:

```text
FPGA
 ↓
Protected Buffer / Level Interface
 ↓
Series Current Limiting
 ↓
Routing Fabric
 ↓
Breadboard Node
```

Các cơ chế tối thiểu:

- current-limited supply;
- over-current monitor;
- fast power cutoff;
- tri-state default;
- output contention protection;
- safe startup state;
- watchdog;
- FPGA heartbeat;
- routing default-open;
- staged energization;
- timeout về `SAFE_STATE`.

Nhờ đó `UNKNOWN_COMPONENT` không đồng nghĩa `UNSAFE`.

---

# 29. Mini PC ↔ FPGA Transport

Do Mini PC không có GPIO/SPI trực tiếp như Raspberry Pi, transport được abstraction hóa.

```text
FpgaTransport
│
├── SerialTransport
├── SpiUsbTransport
├── Usb3Transport
└── EthernetTransport
```

## Prototype

Khuyến nghị:

```text
USB-UART
hoặc
USB-SPI
```

## Final high-throughput

Khuyến nghị:

```text
USB 3 FIFO
```

đặc biệt khi triển khai:

- Logic Analyzer.
- Oscilloscope.
- Large capture.

---

# 30. FPGA Protocol

Protocol frame:

```text
SOF
Version
Command
Sequence
Length
Payload
CRC
EOF
```

Command:

```text
GET_CAPABILITY
SET_CLOCK
SET_ROUTE
WRITE_OUTPUT
CONFIGURE_TRIGGER
ARM_CAPTURE
START_CAPTURE
READ_CAPTURE
STOP
RESET
SAFE_STATE
```

Mỗi command có:

```text
sequence
timeout
response
error_code
```

---

# 31. FPGA Responsibilities

## 31.1 Phạm vi Physical Circuit hiện tại

FPGA phiên bản V1 chỉ chịu trách nhiệm thực thi **mạch số vật lý**.

```text
Physical Digital Circuit → SUPPORTED
Physical Analog Circuit  → FUTURE
```

Điều này không ngăn Mini PC mô phỏng analog.

## 31.2 Các chức năng FPGA V1/Final Digital Platform

```text
Clock Generation
Deterministic Switching
Timestamping
Digital Routing Control
Logic Capture
Trigger
Digital IO
Topology Scan Coordination
Runtime Safety Monitor Interface
Guarded Power-Up Coordination
Protected Drive Enable
DDS / Function Generator Control
ADC Interface / Oscilloscope Acquisition
SDRAM Controller
Acquisition
```

Oscilloscope và Function Generator là **instrument subsystem**:
- Tín hiệu analog đi qua ADC/DAC/AFE bên ngoài.
- FPGA chỉ xử lý control, timing, DDS, trigger, acquisition và buffering.
- Việc có ADC/DAC instrument không đồng nghĩa FPGA V1 đã hỗ trợ arbitrary analog circuit routing.

FPGA không xử lý:

- User management.
- Project management.
- Circuit editing.
- Database.
- WebSocket.
- Authentication.
- Circuit persistence.

---

# 32. Mini PC Responsibilities

Mini PC xử lý:

```text
Web Server
API
Authentication
Database
Circuit Validation

Digital Virtual Simulation
Analog Virtual Simulation
Mixed-Signal Coordination

Digital Physical Compiler V1
Future Analog Physical Compiler Adapter

Topology Discovery Orchestration
Safety Verification
Topology Verification
Functional Verification
Execution Policy
Topology Matching
Routing Solver
Experiment Lifecycle
Session / Lease / Queue
Capture Management
Waveform Processing
Hardware Coordination
Storage
Logging
```

Nguyên tắc quan trọng:

> Việc FPGA V1 chỉ hỗ trợ physical digital circuit không làm thay đổi kiến trúc Mini PC. Khi phần cứng analog được thêm sau này, chỉ cần thêm capability, compiler adapter và driver tương ứng.

---

# 33. Capability Discovery

Frontend không hard-code số lượng channel/resource.

Station trả:

```text
StationCapabilities
```

Ví dụ:

```text
digitalInputs
digitalOutputs

virtualDigital = true
virtualAnalog = true

physicalDigital = true
physicalAnalogRouting = false   # V1

physicalExecutionSlots = 1      # mặc định với một shared physical fabric

logicAnalyzerChannels
oscilloscopeChannels = 2
generatorChannels = 2

maxSampleRate
routingResources
topologyScanSupported = true
safetyGateSupported = true
guardedRunSupported = true
componentResolutionModes = [AUTO_DISCOVERY, INSTRUCTOR_PROFILE, HYBRID]
supportedComponents
supportedFeatures
firmwareVersion
```

Frontend và Experiment Manager tự điều chỉnh behavior dựa trên capabilities.

Khi nâng cấp hardware analog trong tương lai:

```text
physicalAnalogRouting = true
```

mà không phải thay đổi kiến trúc frontend/Mini PC.

---

# 34. Logic Analyzer Architecture

```text
Digital Inputs
     ↓
FPGA
     ↓
Trigger
     ↓
Sampling
     ↓
SDRAM
     ↓
Compression
     ↓
Mini PC
     ↓
WebSocket Binary
     ↓
Browser
```

Có thể dùng:

```text
RLE
```

để giảm dung lượng digital capture.

---

# 35. Oscilloscope Architecture

Phiên bản hiện tại hỗ trợ:

> **2 Oscilloscope Channels**

```text
CH1 Probe ─→ AFE1 ─→ ADC CH1 ─┐
                               │
CH2 Probe ─→ AFE2 ─→ ADC CH2 ─┼─→ FPGA Acquisition
                               │
                               ▼
                            Trigger
                               ↓
                         Capture Buffer
                               ↓
                             SDRAM
                               ↓
                    Decimation / Windowing
                               ↓
                            Mini PC
                               ↓
                       WebSocket Binary
                               ↓
                            Browser
```

FPGA chịu trách nhiệm:

```text
sample timing
trigger
timestamp
channel synchronization
buffer control
SDRAM arbitration
capture state machine
```

AFE và ADC nằm ngoài FPGA.

Không stream toàn bộ raw ADC liên tục lên browser; chỉ truyền capture/window cần thiết.

---

# 36. Function Generator Architecture

Phiên bản hiện tại hỗ trợ:

> **2 Function Generator Channels**

```text
                     ┌─→ DDS CH1 ─→ DAC1 ─→ Filter/Output Stage ─→ OUT1
Browser Control ─→ FPGA
                     └─→ DDS CH2 ─→ DAC2 ─→ Filter/Output Stage ─→ OUT2
```

Luồng điều khiển:

```text
Browser
  ↓
Backend
  ↓
Hardware Service
  ↓
FPGA DDS
  ↓
DAC / Output Stage
  ↓
Physical Circuit
```

FPGA quản lý riêng từng channel:

```text
frequency
phase
waveform
timing
trigger synchronization
enable/disable
```

DAC, reconstruction filter và output amplifier nằm ngoài FPGA.

## 36.1 FPGA Instrument Resource Architecture

Oscilloscope 2CH, Function Generator 2CH và Logic Analyzer phải là các module độc lập.

```text
                    EP4CE10
┌────────────────────────────────────────────┐
│ Protocol / Control                         │
│        │                                   │
│        ├──────────── Instrument Bus ────────┤
│        │              │          │         │
│        ▼              ▼          ▼         │
│ Logic Analyzer   Scope 2CH    DDS 2CH      │
│        │              │          │         │
│        └──────┬───────┘          │         │
│               ▼                  │         │
│          SDRAM Arbiter           │         │
│               ↓                  │         │
│        SDRAM Controller          │         │
│                                  │         │
│ Clock / PLL / Trigger / Timestamp│         │
└────────────────────────────────────────────┘
          │                         │
       ADC/AFE                    DAC/AFE
```

### SDRAM arbitration

Không cho Scope, Logic Analyzer và Host Readback tự điều khiển SDRAM độc lập.

```text
Scope Capture ──────┐
Logic Analyzer ─────┼──→ SDRAM Arbiter ─→ SDRAM
Host Readback ──────┘
```

### Clock Domain Crossing

Các clock domain phải tách rõ:

```text
System Clock
ADC Sample Clock
DDS Clock
SDRAM Clock
USB Interface Clock
```

Sử dụng CDC FIFO/synchronizer tại các boundary.

---

# 37. Waveform Transport

Không dùng JSON cho capture lớn.

Dùng:

> **WebSocket Binary Frame**

Header:

```text
capture_id
instrument
channel
sample_rate
sample_count
timestamp
encoding
```

Payload:

```text
Int16
Uint16
Float32
RLE blocks
```

tùy loại dữ liệu.

---

# 38. Database

Production/multi-user sử dụng:

> **PostgreSQL**

Lưu:

```text
users
roles
projects
circuits
experiments
stations
station leases
queues
capture metadata
audit logs
settings
```

SQLite chỉ phù hợp prototype.

---

# 39. Capture Storage

Không lưu waveform lớn trực tiếp trong PostgreSQL.

PostgreSQL lưu metadata.

Capture data lưu:

```text
/data/captures/
```

Có thể nâng thành object storage trong tương lai.

---

# 40. Authentication và Authorization

Giai đoạn đầu:

```text
username/password
server-side session
HTTP-only secure cookie
RBAC
```

Role:

```text
Student
Instructor
Administrator
```

Tương lai có thể tích hợp:

```text
OIDC
SSO
University account
```

---

# 41. Multi-user Architecture

Mục tiêu:

> **30–50 users có thể kết nối và sử dụng hệ thống.**

Cần phân biệt rõ:

```text
30–50 Connected Users
        ≠
30–50 Simultaneous Physical Executions
```

## 41.1 Virtual Users

```text
30–50 users
    ↓
independent logical sessions
    ↓
Simulation Manager
    ↓
Process Worker Pool
```

Virtual simulation có thể chạy song song trong giới hạn CPU/RAM.

## 41.2 Physical Users

Nhiều người dùng có thể đồng thời:

- đăng nhập;
- chỉnh sửa circuit;
- validate;
- chuẩn bị experiment;
- xem trạng thái;
- gửi yêu cầu Run.

Nhưng FPGA chỉ nhận số lượng experiment vật lý tương ứng với:

```text
StationCapabilities.physicalExecutionSlots
```

Với một shared breadboard/routing fabric V1:

```text
physicalExecutionSlots = 1
```

Do đó:

```text
30–50 Physical Users
        ↓
Experiment Scheduler
        ↓
Run Queue
        ↓
Active Execution Slot
        ↓
FPGA
```

Việc người dùng không bấm `Run` cùng một thời điểm giúp giảm contention thực tế, nhưng kiến trúc **không được dựa vào giả định này để đảm bảo correctness**.

Nếu nhiều người bấm Run gần như đồng thời:

```text
Admission Control
      ↓
Queue
      ↓
Serialized Physical Execution
```

FPGA xử lý experiment đang active; Mini PC chịu trách nhiệm scheduling, ownership, timeout và queue.

## 41.3 Khả năng mở rộng tương lai

Nếu FPGA + routing hardware sau này được partition thành nhiều vùng điện cách ly:

```text
physicalExecutionSlots = N
```

thì Scheduler có thể chạy N experiment vật lý đồng thời mà frontend không đổi.

---

# 42. Station Lease & Run Scheduler

Mỗi experiment vật lý có lease ngắn hạn.

```text
User A ─┐
User B ─┼──→ Run Queue ─→ Execution Slot 0 ─→ FPGA
User C ─┘
```

Lifecycle:

```text
QUEUED
  ↓
RESERVED
  ↓
SAFE_STATE
  ↓
TOPOLOGY_SCAN
  ↓
SAFETY_CHECK
  ↓
EXECUTION_DECISION
  ↓
ROUTE_PREPARE
  ↓
GUARDED_POWER_UP
  ↓
RUNNING
  ↓
CAPTURING
  ↓
FUNCTIONAL_VERIFY
  ↓
COMPLETE
  ↓
SAFE_STATE
  ↓
RELEASE
```

Nếu client mất kết nối hoặc timeout:

```text
STOP
 ↓
SAFE_STATE
 ↓
release routing/resources
 ↓
next queued experiment
```

### Scheduler policy V1

Ưu tiên đơn giản:

```text
FIFO
+
per-user rate limit
+
maximum execution time
```

Không cần message broker trong V1.

---

# 43. Deployment Architecture

Mini PC chạy:

```text
Linux
Nginx
FastAPI
Hardware Service
PostgreSQL
systemd
```

System services:

```text
nginx.service
postgresql.service
netcircuit-api.service
netcircuit-hardware.service
```

Docker Compose có thể dùng cho:

- Development.
- CI.
- Integration test.

Không bắt buộc cho production V1.

---

# 44. Storage Capacity

SSD 256 GB đủ cho giai đoạn đầu.

Khi có:

```text
large logic captures
oscilloscope captures
history
logs
many projects
3D assets
```

nên nâng lên:

```text
512 GB hoặc 1 TB NVMe
```

---

# 45. Unified Result Model

Virtual và Physical đều trả kết quả theo logical contract chung, nhưng Physical Lab có thêm verification results.

```text
ExperimentResult
│
├── executionState
├── executionDecision
│
├── safetyVerification
├── topologyVerification
├── functionalVerification
│
├── digitalSignals
├── analogCaptures
├── timestamps
├── instrumentStatus
├── warnings
├── errors
└── rawObservations
```

Frontend không cần biết dữ liệu đến từ Virtual Simulator hay Physical FPGA để render kết quả, nhưng có thể hiển thị rõ ba lớp:

```text
SAFETY
TOPOLOGY
FUNCTION
```

Ví dụ:

```text
Safety:   SAFE
Topology: MISMATCH
Function: FAIL
```

Đây là trường hợp hợp lệ trong triết lý phòng thí nghiệm: mạch sinh viên sai nhưng vẫn được phép chạy an toàn.

---

# 46. Component Architecture chính thức

```text
net-Circuit-Remote
│
├── Web Application
│   ├── Workspace Shell
│   ├── Circuit Editor
│   ├── Component Library UI
│   ├── 3D Renderer
│   ├── Instrument UI
│   ├── Project Manager
│   ├── Property Inspector
│   ├── API Client
│   └── WebSocket Client
│
├── Circuit Domain
│   ├── DesignGraph
│   ├── ValidatedGraph
│   ├── Net Resolver
│   ├── Validation
│   └── Serialization
│
├── Backend
│   ├── Auth
│   ├── Project Service
│   ├── Circuit Service
│   ├── Validation Service
│   ├── Assignment Service
│   ├── Safety Verification Service
│   ├── Topology Verification Service
│   ├── Functional Verification Service
│   ├── Execution Policy
│   ├── Experiment Manager
│   ├── Station Manager
│   ├── Capture Manager
│   ├── Persistence
│   └── WebSocket Gateway
│
├── Simulation
│   ├── Event Scheduler
│   ├── Device Models
│   ├── Net Engine
│   ├── Clock Engine
│   ├── Timing Model
│   ├── Virtual Generator
│   ├── Virtual Logic Analyzer
│   └── Virtual Oscilloscope
│
├── Physical Lab Domain
│   ├── AssignmentDefinition
│   ├── LabEndpoint
│   ├── BreadboardNodeMap
│   ├── DetectedTopologyGraph
│   ├── ComponentResolver
│   ├── SafetyVerificationResult
│   ├── TopologyVerificationResult
│   ├── FunctionalVerificationResult
│   └── ExecutionDecision
│
├── Physical Compiler
│   ├── Hardware Binding
│   ├── Routing Solver
│   └── PhysicalExecutionPlan
│
├── Hardware Service
│   ├── HardwareStation
│   ├── VirtualHardwareStation
│   ├── PhysicalHardwareStation
│   ├── FPGA Driver
│   ├── FPGA Protocol
│   ├── FPGA Transport
│   ├── Safety Controller
│   ├── Power Safety Controller
│   └── Runtime Protection Monitor
│
├── FPGA
│   ├── Protocol Engine
│   ├── Control Engine
│   ├── Routing Controller
│   ├── Clock Generator
│   ├── Trigger Engine
│   ├── Logic Analyzer
│   ├── DDS
│   ├── ADC Interface
│   ├── Acquisition
│   └── SDRAM Controller
│
└── Infrastructure
    ├── PostgreSQL
    ├── Capture Storage
    ├── Nginx
    ├── systemd
    └── Logging
```

---

# 47. Technology Stack chính thức

| Layer | Công nghệ |
|---|---|
| Frontend | Vue 3 |
| Frontend Language | TypeScript |
| Build Tool | Vite |
| State Management | Pinia |
| 3D Engine | Three.js |
| 3D Asset | GLB + Meshopt + KTX2 |
| Backend | FastAPI |
| Validation | Pydantic / JSON Schema |
| Hardware RPC | gRPC + Protobuf |
| Digital Simulation | Python Discrete Event Engine |
| Analog Simulation | SPICE-compatible Adapter on Mini PC |
| Simulation Concurrency | Process Worker Pool |
| Database | PostgreSQL |
| Realtime Browser | WebSocket |
| Waveform Transport | WebSocket Binary |
| Reverse Proxy | Nginx |
| Service Management | systemd |
| Prototype FPGA | EP4CE6 |
| Final FPGA | EP4CE10 + SDRAM |
| Physical Circuit V1 | Digital only |
| Oscilloscope | 2 channels, external AFE/ADC |
| Function Generator | 2 channels, external DAC/output stage |
| Breadboard Discovery | Active Electrical Topology Discovery |
| IC Resolution | AUTO_DISCOVERY + INSTRUCTOR_PROFILE + HYBRID |
| Physical Run Policy | Safety-gated, not correctness-gated |
| Verification | Safety + Topology + Functional |
| Prototype PC-FPGA Transport | USB-UART / USB-SPI |
| High-throughput PC-FPGA Transport | USB 3 FIFO |
| Edge Server | Mini PC Xeon W-1370 |

---

# 48. Công nghệ không dùng trong V1

Không sử dụng nếu chưa có nhu cầu thực tế:

```text
Kubernetes
Kafka
RabbitMQ
Redis Cluster
Full Microservices
GraphQL
Electron
Unity
Unreal Engine
Rust Rewrite
PCIe FPGA
Server-side 3D Rendering
Cloud-only Database
```

Mục tiêu là tránh overengineering.

---

# 49. Roadmap phát triển chính thức

## Phase A — Architecture Stabilization

Chuẩn hóa:

```text
DesignGraph
ValidatedGraph
SignalDomain
ExecutionPlan
HardwareStation
StationCapabilities
Unified Result Model
AssignmentDefinition
LabEndpoint
SafetyVerificationResult
TopologyVerificationResult
FunctionalVerificationResult
ExecutionDecision
BreadboardNodeMap
DetectedTopologyGraph
```

---

## Phase B — Virtual Digital Circuit Engine

Xây:

```text
Event Scheduler
Logic Propagation
Clock
Basic Gates
LED
Switch
7-Segment
Flip-Flop
Counter
Register
Simulation Worker Pool
```

Mục tiêu:

```text
Web
 ↓
Simulator
 ↓
Web
```

hoàn chỉnh.

---

## Phase C — Virtual Instruments

Xây:

```text
Virtual Generator
Virtual Logic Analyzer
Virtual Oscilloscope
```

---

## Phase C2 — Mini PC Analog Simulation Foundation

Bổ sung mà không thay đổi frontend architecture:

```text
SignalDomain
Analog Compiler
SPICE-compatible Adapter
Analog Waveform Adapter
Mixed-Signal Coordinator boundary
```

Mục tiêu:

```text
Virtual Digital → supported
Virtual Analog  → supported
Physical Digital → target V1
Physical Analog → future hardware
```

---

## Phase D — Backend Lifecycle

Xây:

```text
Projects
Experiments
Sessions
Persistence
Station Manager
Capture Manager
```

Chuyển database:

```text
SQLite
  ↓
PostgreSQL
```

---

## Phase E — Mini PC Deployment

Triển khai:

```text
Nginx
FastAPI
PostgreSQL
Hardware Service
systemd
```

Stress test:

```text
30–50 users
```

---

## Phase F — FPGA Transport Emulator

Tạo Fake FPGA để test:

```text
command
response
timeout
CRC error
disconnect
reset
```

---

## Phase G — EP4CE6 Prototype

Triển khai:

```text
protocol
GPIO
clock
basic routing
small capture
safe state
```

Không thêm SDRAM ở prototype.

---

## Phase H — Lab-First Physical Safety + Auto-Discovery + Digital Routing

Triển khai:

```text
AssignmentDefinition
LabEndpoint

BreadboardNodeMap
Scan Matrix
Safe Stimulus Front-End
High-Impedance Sense
DetectedTopologyGraph

AUTO_DISCOVERY
INSTRUCTOR_PROFILE
HYBRID Resolver
OPAQUE_PHYSICAL_COMPONENT

Safety Verification
Topology Verification
Functional Verification
Execution Policy

Current-Limited Power
Current Sense
Fast Cutoff
Protected Digital Drive
Guarded Power-Up

MUX / Crosspoint Digital Routing
Hardware Profile
Physical Compiler
Routing Solver
```

Mục tiêu:

> Sinh viên không cần lắp linh kiện đúng vị trí giáo viên. Hệ thống chặn nguy hiểm, không chặn mọi sai sót học tập; circuit an toàn được chạy và kết quả vật lý quyết định đúng/sai.

---

## Phase I — EP4CE10 Migration

```text
EP4CE6
   ↓
EP4CE10
```

Giữ protocol tương thích.

---

## Phase J — SDRAM + Logic Analyzer

Thêm:

```text
SDRAM
capture buffer
trigger
timestamp
compression
```

---

## Phase K — Function Generator 2CH

Thêm:

```text
DDS CH1
DDS CH2
DAC CH1
DAC CH2
frequency
phase
waveform
synchronization
output enable
```

---

## Phase L — Oscilloscope 2CH

Thêm:

```text
AFE CH1 / CH2
ADC CH1 / CH2
shared trigger engine
channel synchronization
SDRAM capture
SDRAM arbiter
decimation
waveform transport
```

---

## Phase M — Multi-user Physical Lab

Mục tiêu:

```text
30–50 connected users
1 physical execution slot V1
burst Run requests serialized by scheduler
```

Thêm:

```text
Reservation
Lease
Run Queue
Admission Control
Execution Slot
Timeout
Permission
Recovery
Audit
```

Sau này nếu hardware được partition an toàn:

```text
physicalExecutionSlots > 1
```

mà không thay đổi frontend architecture.

---

## Phase N — Future Physical Analog Hardware

Không nằm trong FPGA/Physical V1.

Khi phát triển:

```text
Analog Routing Fabric
Analog Switch / Relay Matrix
Analog ERC
Calibration Profiles
Future FPGA/AFE Extensions
```

Mini PC giữ nguyên:

```text
CircuitGraph
SignalDomain
Analog Compiler Interface
HardwareStation
StationCapabilities
Unified Result Model
```

---

# 50. Kiến trúc Virtual-to-Physical cuối cùng — Lab-First

```text
                           USER
                             │
                             ▼
                      Web CAD Workbench
                             │
                             ▼
                        Assignment / Design
                             │
                             ▼
                        ValidatedGraph
                             │
              ┌──────────────┴───────────────┐
              │                              │
              ▼                              ▼
       VIRTUAL EXECUTION             PHYSICAL LAB EXECUTION
              │                              │
      SignalDomain Dispatch                  ▼
       ┌──────┴──────┐                  SAFE_STATE
       │             │                       │
       ▼             ▼                       ▼
 Digital Compiler  Analog Compiler     Electrical Topology Scan
       │             │                       │
       ▼             ▼                       ▼
 Discrete Event     SPICE             DetectedTopologyGraph
 Simulator          Adapter                   │
       │             │             ┌──────────┴──────────┐
       └──────┬──────┘             │                     │
              │                    ▼                     ▼
              │             Safety Verification   Topology Verification
              │                    │                     │
              │                    └──────────┬──────────┘
              │                               ▼
              │                       ExecutionDecision
              │                      ┌────────┴────────┐
              │                      │                 │
              │                BLOCK_SAFETY      RUN / GUARDED
              │                                        │
              │                                        ▼
              │                               Physical Compiler
              │                                        │
              │                                        ▼
              │                                  Routing Solver
              │                                        │
              │                                        ▼
              │                                Guarded Power-Up
              │                                        │
              │                                        ▼
              │                                     EP4CE10
              │                           ┌────────────┼────────────┐
              │                           │            │            │
              │                           ▼            ▼            ▼
              │                     Digital Route   Scope 2CH   Generator 2CH
              │                           │            │            │
              │                           ▼           ADC          DAC
              │                     Student Circuit    │            │
              │                           │            │            │
              │                           └──────┬─────┴────────────┘
              │                                  ▼
              │                         Observed Physical Signals
              │                                  │
              │                                  ▼
              │                        Functional Verification
              │                                  │
              └───────────────────┬──────────────┘
                                  ▼
                         Unified Result Model
                                  │
                                  ▼
                         WebSocket / Binary
                                  │
                                  ▼
                                  UI

UI displays independently:
  SAFETY
  TOPOLOGY
  FUNCTION
```

### Nguyên tắc quyết định

```text
UNSAFE
  → BLOCK

SAFE + WRONG
  → RUN

SAFE + UNKNOWN COMPONENT
  → RUN_GUARDED

SAFE + TOPOLOGY MISMATCH
  → RUN

UNEXECUTABLE HARDWARE ROUTE
  → BLOCK_UNEXECUTABLE
```

### Future Physical Analog

Khi bổ sung analog hardware:

```text
Safety Gate
   ↓
Analog Physical Compiler
   ↓
Analog Routing / AFE
   ↓
PhysicalHardwareStation
```

Triết lý Lab-First vẫn giữ nguyên.

---

# 51. Kết luận kiến trúc

Kiến trúc chính thức được đề xuất cho **net*CIRCUIT Remote** là:

> **Safety-Gated, Lab-First, Contract-Driven Virtual-to-Physical Laboratory Architecture**

Các quyết định kiến trúc cốt lõi:

1. **Vue 3 + TypeScript + Three.js** cho Web Workbench.
2. **CircuitGraph** là source of truth.
3. Tách dữ liệu thành **DesignGraph → ValidatedGraph → ExecutionPlan**.
4. **FastAPI Modular Monolith** làm backend.
5. **Hardware Service** là process riêng.
6. **gRPC + Protobuf** cho Backend ↔ Hardware Service.
7. **REST + WebSocket** cho Browser ↔ Backend.
8. **Python Discrete Event Simulator** cho Virtual Hardware.
9. `HardwareStation` là abstraction chung cho Virtual và Physical.
10. **Physical Compiler + ERC + Routing Solver** đứng giữa logical circuit và hardware.
11. **Mini PC Xeon W-1370** làm Edge Server/Controller.
12. **FPGA** chỉ đảm nhiệm các tác vụ deterministic/timing-critical.
13. **EP4CE6** dùng cho prototype.
14. **EP4CE10 + SDRAM** dùng cho bản final.
15. PC ↔ FPGA dùng abstraction transport; prototype dùng USB-UART/USB-SPI, high-throughput dùng USB 3 FIFO.
16. **PostgreSQL** dùng cho production/multi-user.
17. **WebSocket Binary** dùng cho waveform/capture data.
18. Không sử dụng các công nghệ phức tạp nếu chúng chưa giải quyết một nhu cầu thực tế.
19. Breadboard dùng **Active Electrical Topology Discovery** để tự xác định topology vật lý; không bắt sinh viên đặt linh kiện giống vị trí giáo viên.
20. Mini PC hỗ trợ kiến trúc **Digital + Analog Simulation**, trong khi Physical FPGA V1 chỉ chạy mạch số.
21. Analog physical hardware tương lai được thêm qua capability/compiler/driver mới, không rewrite Mini PC/frontend.
22. 30–50 users được hỗ trợ ở mức kết nối/session; physical execution V1 dùng queue + execution slot thay vì giả định 30–50 Run đồng thời.
23. `physicalExecutionSlots` là capability; V1 mặc định bằng 1.
24. EP4CE10 quản lý **Oscilloscope 2CH + Function Generator 2CH**, dùng AFE/ADC/DAC/SDRAM bên ngoài.
25. Scope, Logic Analyzer và Host Readback dùng **SDRAM Arbiter** chung.
26. Physical Lab áp dụng nguyên tắc **Safety-gated, not correctness-gated**.
27. `SafetyVerificationResult`, `TopologyVerificationResult`, `FunctionalVerificationResult` là ba kết quả độc lập.
28. Chỉ safety/unexecutable failures mới chặn Run; topology mismatch không mặc định chặn.
29. `ExecutionDecision` gồm `BLOCK_SAFETY`, `BLOCK_UNEXECUTABLE`, `RUN_NORMAL`, `RUN_GUARDED`.
30. IC ngoài thư viện có thể trở thành `OPAQUE_PHYSICAL_COMPONENT` và vẫn được chạy guarded nếu hardware safety envelope đảm bảo.
31. Hỗ trợ `AUTO_DISCOVERY`, `INSTRUCTOR_PROFILE`, và `HYBRID`; HYBRID là lựa chọn mặc định cho V1.
32. `AssignmentDefinition` tách đề bài khỏi circuit vật lý của sinh viên.
33. `LabEndpoint` cho phép FPGA drive/sense các điểm x/y/d/b mà không cần hiểu toàn bộ IC bên trong trước khi Run.
34. Physical safety phải được bảo vệ bằng current limiting, current sensing, fast cutoff, protected digital drive và guarded power-up.
35. Kết quả học tập cuối cùng ưu tiên **measured behavior** của circuit thật.

## Cấu hình chức năng V1 được chốt

```text
Mini PC:
  Virtual Digital      = YES
  Virtual Analog       = YES
  30–50 user sessions  = TARGET

FPGA / Physical:
  Digital Circuit      = YES
  Analog Circuit       = NO (future)
  Auto Topology Scan   = YES
  Lab-First Safety Gate = YES
  Guarded Run          = YES
  IC Resolution        = AUTO / INSTRUCTOR / HYBRID
  Oscilloscope         = 2 channels
  Function Generator   = 2 channels
  Logic Analyzer       = YES
  External SDRAM       = YES
  Physical Exec Slots  = 1 by default
```

Mục tiêu cuối cùng là cho phép cùng một circuit:

```text
DesignGraph
```

có thể chạy:

```text
Virtual Simulation
```

hoặc:

```text
Physical Experiment
```

mà frontend, workflow và logical model không cần thay đổi.


---

# 52. Architectural Decision Record — Lab-First Policy

## ADR-LAB-001 — Safety is a hard gate; correctness is not

**Decision**

```text
Computer checks SAFETY
→ safe circuit is allowed to run
→ physics produces behavior
→ software evaluates and teaches
```

**Reason**

Một Remote Lab phải giữ trải nghiệm gần phòng thí nghiệm thật:
- sinh viên có thể lắp sai;
- có thể chọn nhầm IC;
- có thể thiếu linh kiện;
- có thể dùng IC ngoài thư viện;
- circuit vẫn nên được phép chạy nếu phần cứng chứng minh nó nằm trong safety envelope.

**Consequences**

- Không dùng Topology Matcher làm Run Gate.
- Phải có hardware protection đủ mạnh để `UNKNOWN_COMPONENT` không tự động đồng nghĩa `UNSAFE`.
- Cần tách Safety / Topology / Functional Verification.
- UI phải hiển thị kết quả vật lý thật, không chỉ thông báo “đúng/sai trước khi chạy”.

## ADR-LAB-002 — HYBRID component resolution for V1

**Decision**

```text
Expected type / pin semantics ← Instructor Profile
Physical location             ← Automatic Scan
Behavior / signature          ← FPGA-assisted
```

**Reason**

Nhận dạng mọi IC hoàn toàn tự động là không thực tế cho V1, nhưng bắt sinh viên đặt IC đúng tọa độ giáo viên làm mất tính phòng thí nghiệm.

## ADR-LAB-003 — Unknown components are observable black boxes

**Decision**

IC không resolve được vẫn có thể được chạy `RUN_GUARDED` nếu:
- supply/drive safety được đảm bảo;
- các LabEndpoint cần thiết route được;
- runtime protection hoạt động.

**Expected behavior**

```text
UNKNOWN COMPONENT
→ maybe NO_RESPONSE
→ maybe WRONG_OUTPUT
→ maybe PARTIAL_OUTPUT
```

Web hiển thị tín hiệu đo được thay vì chặn chỉ vì component không nằm trong library.

## ADR-LAB-004 — Physical reference is topology/behavior, not placement

Tọa độ breadboard của giảng viên không phải reference để chấm.

Reference gồm:
- logical topology;
- assignment endpoints;
- optional expected IC set;
- expected truth table/timing/waveform;
- safety policy.

Sinh viên được tự do chọn vị trí linh kiện trên breadboard.
