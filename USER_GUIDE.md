# Cable Sizing Calculator — 사용 설명서

저압(IEC 60364-5-52, ≤ 1 kV)과 한국 22.9 kV 배전(KEPCO ES 6145, CNCV-W 단심) 전원케이블의 단일회로 사이징을 자동화하는 웹 애플리케이션입니다. 본 설명서는 **실행 → 입력 → 결과 해석 → 검증 케이스** 순으로 구성되어 있습니다. 모든 검증 예제의 수치는 엔진(`@cable-sizing/engine` v0.12.0)을 실제로 실행해 채웠으므로, 동일 입력을 그대로 입력하시면 동일한 결과가 나와야 합니다.

> **v1.3 (LV 입력 자동화)**: 설계전류(I_B), 부하 도체 수(loadedConductors), 외장 단면적(armour CSA)이 입력으로부터 자동 도출되며, 각 도출값은 출처(`auto_formula` / `auto_dataset` / `user` / `override` / `legacy_preserved`)와 상태가 표시됩니다. 자세한 사용법은 §5.4 참조.

---

## 1. 개요

| 항목 | 내용 |
|---|---|
| 적용 표준 | LV: IEC 60364-5-52 / IEC 60364-5-54 / IEC 60287-1-1 / IEC 60228 · MV: KEPCO ES 6145, KS C IEC 60502, IEC 60949 |
| 도체/절연 | LV: Cu·Al × PVC·XLPE · MV: Cu / XLPE 단심 (CNCV-W, TR-CNCV-W, FR-CNCO-W) |
| 사이즈 범위 | LV: 1.5–300 mm² (Cu), 16–300 mm² (Al) · MV: 60–600 mm² |
| 검증 항목 | 허용전류(IZ ≥ IB), 전압강하 ΔU%, 단락내량(도체 + 차폐), 보호장치 협조 |
| 결과 형식 | 권장 단면적 + 결정 요인(driver) + 통과/실패 + 경고/오류 + 감사로그(auditTrail) |

비목표(MVP에서 다루지 않음): 154 kV 이상, 병렬 케이블, 릴레이 협조 시간계산, 교차본딩, 다회로 동시 사이징.

---

## 2. 실행 방법

### 운영 환경(Vercel)
`main` 브랜치는 자동 배포됩니다. 운영 URL을 브라우저에서 열어 곧바로 사용하시면 됩니다.

### 개발 환경(로컬)
```bash
cd cable-sizing
npm install
npm --workspace packages/engine run build      # 호스트가 dist/를 읽으므로 최초 1회 필요
npm --workspace packages/host-web run dev      # http://localhost:5173/
```

브라우저에서 `http://localhost:5173/`로 접속하면 3단 레이아웃(입력 폼 / 결과 / 진단 정보)이 표시됩니다.

### 빌드 / 검증
```bash
npm run build       # 모노레포 전체 (engine → host-web)
npm run typecheck   # 타입 검사
npm run test        # 560(엔진) + 56(호스트) = 616개 테스트 모두 통과
```

---

## 3. 화면 구성

```
┌────────── header ──────────────────────────────────────┐
│ Cable Sizing Calculator                                 │
├──────── form ──────┬────── result ──────┬─── diag ─────┤
│ Voltage class      │ Recommended CSA    │ engine ver.  │
│ ┌ LV / MV ─────┐   │ ┌─────────────────┐│ datasetId    │
│ │ (셀렉터)      │   │ │   N mm² (PASS)  ││ apiVersion   │
│ └──────────────┘   │ └─────────────────┘│              │
│                    │  Criteria 표        │              │
│ (LV 또는 MV 폼)    │  Warnings / Errors  │              │
│ ...                │  Audit trail        │              │
│ [Size cable] 버튼  │                     │              │
└────────────────────┴─────────────────────┴──────────────┘
```

가장 위 **Voltage class** 셀렉터에서 LV / MV를 선택하면 그 아래 폼이 통째로 교체됩니다. 입력은 두 모드가 별도로 보존되므로 토글해도 값을 잃지 않습니다.

---

## 4. 공통 워크플로우

1. **Voltage class** 선택 (LV / MV)
2. 부하 → 케이블 → 포설 → 보호 → 정책 순으로 입력
3. 우측 하단 **Size cable** 클릭
4. 결과 패널의 **Recommended CSA** + **Driver** 확인
5. **Criteria** 표에서 4–6개 항목별 PASS/FAIL 검토
6. **Warnings / Audit trail**로 보정계수·중간계산값 검증

결과 상태는 `PASS / WARNING / FAIL / INCOMPLETE` 4종입니다.
- **INCOMPLETE**는 "선택적 입력이 빠져 검증 일부를 건너뛰었음"을 뜻하며 실패가 아닙니다(예: MV에서 지락전류를 입력하지 않으면 차폐 검증이 건너뛰어져 INCOMPLETE).

---

## 5. LV (저압, ≤ 1 kV) 사용법

### 5.1 입력 필드

| 섹션 | 필드 | 설명 |
|---|---|---|
| Load | Load type | general / motor / heater / lighting / **transformer** (v1.3) |
| | Power (kW) | general·heater·lighting·motor에서 노출 |
| | FLA (A) | **motor 선택 시** 1차 입력 (P_kW는 fallback) — v1.3 / CR-OQ-1 |
| | Apparent power (kVA) | **transformer 선택 시** 노출 — v1.3 |
| | Power factor | 0–1 (transformer는 미노출) |
| | Efficiency, Demand factor | 고급 (기본 0.9 / 1.0) |
| | **Override IB** | 자동 도출된 설계전류를 직접 덮어쓸 때 (W-CR-001). 토글 OFF 시 입력값은 세션 동안 보존되어 다시 ON 하면 복원됩니다. |
| System | Voltage (V), Phase, Frequency | 1ϕ 230 / 3ϕ 400 / 50 또는 60 Hz |
| | **Topology** | 1ph2w / 1ph3w / 3ph3w / 3ph4w (v1.3, CR-OQ-3) |
| | **Neutral carries current** | 3ph4w 또는 1ph3w일 때만 노출. ON이면 loadedConductors가 자동 +1 (4 또는 3) — I-CR-001. |
| | Override loaded conductors | 자동 도출된 도체 수를 직접 입력 (W-CR-005) |
| Cable | Conductor / Insulation / Cable type / Core config | Cu·Al × PVC·XLPE × multicore·single-core × 2C/3C/4C/3C+N |
| | **Armour** | none / SWA / STA. SWA·STA 선택 시 외장 단면적이 dataset에서 자동 조회되며 단락내량 검증에 반영됩니다 (CR-OQ-7). |
| | Override armour CSA | 자동 조회된 외장 단면적을 직접 입력 (W-CR-004) |
| Installation | Reference method | A1·A2·B1·B2·C·D1·D2·E·F·G (IEC 60364-5-52 Annex B). v1.3 폼은 케이블 종류에 맞는 method만 기본 노출하고 **"Show all installation methods"** 토글로 전체 표시합니다 (CR-OQ-6). |
| | Ambient (°C) | 공기 또는 지중 환경 |
| | Group count | 동일 트레이/덕트 회로 수 |
| | Soil ρ (K·m/W) | D1/D2일 때만 입력 |
| Route | Length, one-way (m) | 단방향 거리 |
| Protection | Device, In, Isc (kA), Trip time (s) | 단락내량 검증 + 협조 |
| Project policy | Max ΔU (%), Reactance, Resistance model | XLPE/PVC, fixed_reference vs temperature_corrected |

### 5.2 결과 해석

- `IZ = ampacityRow × k1·k2·k3` — k_total은 Criteria 표 1행에 표시됩니다.
- ΔU = √3·IB·(R cosφ + X sinφ)·L (3상) — 한계 초과 시 더 큰 단면적으로 자동 상향됩니다.
- `S_min = Isc·√t / k` — 도체 단락내량 (k=115/143/76/94 in IEC 60364-5-54).
- `Driver`: 어느 기준이 권장 단면적을 결정했는지 (`ampacity` / `voltage_drop` / `short_circuit` / `protection_recheck` / `mixed`).

### 5.3 v1.3 입력 자동화 — Override 플로우

LV 폼은 **자동 도출 + 사용자 override**로 동작합니다. 도출 규칙은 다음과 같습니다.

| 도출 필드 | 우선순위 | 자동 공식/조회 |
|---|---|---|
| `designCurrent` (I_B) | overrides.designCurrent → motor의 FLA → transformer의 kVA → 그 외는 P_kW | 3ϕ: `IB = (P·1000)/(√3·V·cosφ·η)·df` / motor: `IB = FLA·df` / transformer 3ϕ: `IB = (kVA·1000)/(√3·V)·df` |
| `loadedConductors` | overrides.loadedConductors → topology + neutralCarriesCurrent | 1ph2w → 2 / 1ph3w → 2 (ncc=true → 3) / 3ph3w → 3 / 3ph4w → 3 (ncc=true → 4, k4 derating은 v1.3 범위 외 W-CR-008 경고) |
| `armourCsa` | overrides.armourCsaMm2 → 데이터셋 lookup `(coreConfig+armourType+insulation, 도체 csa)` | dataset `iec60364_lv_v1.armour.swa` (SWA용) |

각 도출값은 입력 패널 안의 **DerivedFieldDisplay** 행으로 표시됩니다.

```
┌─────────────────────────────────────────────────────────┐
│ Design current (IB):   126.06 A   ⚙  [OK]               │
│ auto (formula) — formula: IB_3PH_KW                      │
└─────────────────────────────────────────────────────────┘
```

- `⚙` 아이콘과 녹색 `OK` 배지: `auto_formula` (공식으로 계산됨)
- `📊` 아이콘 + `OK`: `auto_dataset` (데이터셋 조회로 채워짐 — 예: armour CSA)
- `✏` 아이콘 + `OK`: `user` (사용자가 입력한 값)
- `⚠` 아이콘 + `OK`: `override` (자동값을 사용자가 덮어씀)
- `📦` 아이콘 + `OK`: `legacy_preserved` (v1.x 프로젝트 마이그레이션 시 보존됨)
- 회색 `N/A`: 적용 불가 (예: armour=none이면 armourCsa는 N/A)
- 적색 `INCOMPLETE`: 상위 입력 누락
- 적색 `INVALID`: 입력값이 허용 범위를 벗어남

#### Override 토글 동작 (CR-OQ-4)

각 자동 필드는 고급 패널에 **Override 체크박스 + 입력 칸** 페어가 있습니다.

1. 토글 OFF (기본): 자동값이 사용되고, "Auto: 126.06 A" 힌트가 표시됩니다.
2. 토글 ON: 입력 칸이 나타나고 사용자 값이 엔진에 override로 전달됩니다 (`W-CR-001` / `W-CR-004` / `W-CR-005`).
3. 토글 OFF로 다시 끄면: 입력 값은 **세션 동안 보존**됩니다. 페이지를 새로고침하면 폐기되지만, 같은 세션에서 다시 ON 하면 이전 값이 복원됩니다.

#### Reference Method Hybrid 노출 (CR-OQ-6)

기본 화면에는 현재 선택된 케이블 타입과 호환되는 자주 쓰는 method만 표시됩니다 (예: multicore이면 B2/C/D1/D2/E). **"Show all installation methods"** 토글을 켜면 모든 method가 보이며, 호환되지 않는 항목은 비활성화 + 사유 툴팁이 붙습니다 (예: F/G는 single-core 전용).

### 5.4 검증 케이스 — LV

#### LV-Case A: 기본 회로 (단락내량이 결정)

| 항목 | 값 |
|---|---|
| 부하 | general, 25 kW, pf=0.85, η=0.9, df=1.0 |
| 시스템 | 400 V / 3ϕ / 50 Hz |
| 케이블 | Cu / PVC / 3C+N / multicore |
| 포설 | Method C, 30 °C, 그룹 1 |
| 거리 | 50 m |
| 보호 | MCB 50 A, Isc 10 kA, t = 0.1 s |
| 정책 | Max ΔU = 5 %, useReactance = false |

**기대 결과**

| 항목 | 값 |
|---|---|
| IB | **47.17 A** |
| 권장 단면적 | **35 mm²** |
| Driver | `short_circuit` |
| Overall status | `PASS` |
| 전압강하 ΔU | 1.840 % (한계 5 %) |
| Iz | 57.0 A |

해설: 25 mm²의 cable rating(54 A)이 `IB=47.17A` 만족하지만 단락내량 `S_min = 10000·√0.1/115 ≈ 27.5 mm²`가 다음 표준 단면적인 35 mm²로 올라가면서 단락내량이 사이징을 결정합니다.

#### LV-Case B: 장거리에서 전압강하가 결정

| 항목 | 값 |
|---|---|
| 부하 | general, 50 kW, pf=0.85, η=0.9, df=1.0 |
| 시스템 | 400 V / 3ϕ / 50 Hz |
| 케이블 | Cu / **XLPE** / 3C+N / multicore |
| 포설 | Method C, 30 °C, 그룹 1 |
| 거리 | **200 m** |
| 보호 | MCB 100 A, Isc 10 kA, t = 0.1 s |
| 정책 | Max ΔU = **3 %** |

**기대 결과**

| 항목 | 값 |
|---|---|
| IB | **94.34 A** |
| 권장 단면적 | **70 mm²** |
| Driver | `voltage_drop` |
| Overall status | `PASS` |
| csa(허용전류 기준) | 25 mm² |
| csa(전압강하 기준) | 70 mm² |
| 최종 ΔU | 2.382 % |

해설: 허용전류만으로는 25 mm²면 충분(rating 116 A > 94 A)이지만 200 m 라인에서 ΔU 3 % 한계 때문에 70 mm²까지 단면적이 상향됩니다. `selectionDriver = voltage_drop`이 이를 명시합니다.

#### LV-Case C: 보정계수 안전측 lookup 경고

| 항목 | 값 |
|---|---|
| Case A 기본값 + Ambient = **35 °C** |

**기대 결과**: `W-LOOKUP-SAFE-SIDE` 경고가 출력됩니다. IEC 60364-5-52 Table B.52.14는 30/35/40 °C 행만 가지고 있어 35 °C는 정확히 일치하지만, 33 °C 같은 중간값을 입력하면 보수적 이웃(작은 factor)을 선택해 더 큰 단면적이 권장됩니다.

---

## 6. MV (22.9 kV, 한국 배전) 사용법

### 6.1 입력 필드

시스템 전압 22.9 kV-Y / U₀ 13.2 kV / 60 Hz / Cu / XLPE는 **고정**되어 입력란에 노출되지 않습니다.

| 섹션 | 필드 | 설명 |
|---|---|---|
| Load | Load type | transformer / general / motor (변압기는 MVA, 그 외는 kW + pf + η + df) |
| | Apparent power (MVA) / Power (kW) | 부하 종류에 따라 활성화 |
| | IB override | 직접 IB 입력 시 활성화 |
| Cable | Cable type | CNCV-W / TR-CNCV-W / FR-CNCO-W |
| | Override screen CSA / capacitance | 미입력 시 dataset 자동 조회 |
| Installation | Method | direct_buried / duct_bank / trough / tunnel |
| | Formation | trefoil / flat_touching / flat_spaced (flat_spaced는 spacing(mm) 필수) |
| | Ground temp (°C) | KEPCO 보정표 범위 15–40 °C |
| | Soil ρ (K·m/W) | 0.5–3.0 K·m/W (필수, 기본값 미적용) |
| | Burial depth (m) | 직매설 시만 활성, 0.6–1.5 m |
| | Group count | 1–6 |
| Protection | Device | VCB / Fuse / Recloser |
| | Rated In (A), Breaking (kA), Isc (kA), Trip time (s) | 보호 협조 입력 |
| | Earth fault Ie (kA), Earth fault t (s) | 차폐 검증 (둘 다 입력하거나 둘 다 비우기) |
| Route | Length (m) | 단방향 거리 |
| Project policy | Max ΔU (%), Verify screen, Charging current threshold | 충전전류 임계값(기본 0.01 = 1 %) |

### 6.2 결과 해석 (MV 추가 항목)

- `k1·k2·k3·k4` 네 보정계수가 분리 표시됩니다(LV는 k1·k2·k3 셋만).
- `Charging current Ic` 행: `Ic ≥ threshold·IB`이면 `I_eff = √(IB² + Ic²)`로 합산되고 `W-MV-CHARGING-APPLIED` 경고가 동반됩니다(보수적 절대치 합산 — 위상상쇄 미반영, Amendment 1).
- `Screen short-circuit` 행: 사용자가 차폐 CSA를 비워두면 dataset에서 conductor CSA에 대응하는 차폐 단면적을 자동 조회 (`W-MV-SCREEN-AUTO-FILLED`). Ie + t 둘 중 하나만 입력하면 `E-MV-VAL-006` 오류, 둘 다 비우면 `INCOMPLETE`.
- 보호 협조는 두 조건만 검증합니다: `In ≥ IB`, `breakingKA ≥ shortCircuitKA`. 릴레이 협조는 비포함 — `W-MV-PROTECTION-DISCLAIMER`로 항상 명시됩니다.

### 6.3 검증 케이스 — MV (Calc Spec v0.2 §13 Golden Cases)

> 표준 baseline (TC-01과 동일):
> 변압기 1 MVA / 22.9 kV / CNCV-W / 직매설 / trefoil / 토양 ρ=1.2 K·m/W / 매설깊이 0.8 m / 그룹 1 / 지중온도 25 °C / 길이 500 m / VCB In=200 A · breaking=25 kA · Isc=12 kA · t=0.5 s / Max ΔU=3 % / verifyScreen=true.
> 각 케이스는 baseline에서 **변경하는 항목만** 적습니다.

#### TC-01 — 허용전류가 결정

| 변경 | (없음) |
|---|---|

**기대 결과**

| 항목 | 값 |
|---|---|
| IB | **25.21 A** (= 1 MVA / √3 / 22 900) |
| k1·k2·k3·k4 | 1.0 / 1.0 / 1.0 / 1.0 (= 1.0) |
| Iz (cable rating) | 265 A |
| 권장 단면적 | **60 mm²** |
| Driver | `mixed` (ampacity, voltage_drop, short_circuit 모두 60 mm²로 일치) |
| ΔU | 0.039 % |
| Ic | 0.70 A (1 % 미만 → 무시) |
| Screen | `INCOMPLETE` (지락전류 미입력) |
| Overall | `INCOMPLETE` |

해설: 모든 검증이 60 mm²를 만족하므로 권장 단면적은 60 mm²입니다. 차폐 검증을 건너뛰어 overall=INCOMPLETE — 정상 시나리오입니다. 지락전류를 입력하면 PASS 또는 FAIL로 확정됩니다.

#### TC-02 — 전압강하가 결정

| 변경 | apparentPowerMVA = **5.0**, lengthM = **3000**, maxVoltageDropPercent = **1.5** |
|---|---|

**기대 결과**: 권장 단면적이 허용전류로 정해질 60 mm²보다 커집니다. 후보 단면적 스캔 결과가 audit trail에 모두 기록되며, 처음으로 ΔU ≤ 1.5 %를 만족하는 단면적이 선정됩니다.

#### TC-03 — 단락내량이 결정

| 변경 | shortCircuitKA = **25**, tripTimeS = **1**, breakingKA = **31.5** |
|---|---|

**기대 결과**

| 항목 | 값 |
|---|---|
| `S_raw` (도체) | **174.83 mm²** (= 25 000·√1 / 143) |
| 권장 단면적 | **200 mm²** (다음 표준 단면적) |
| Driver | `short_circuit` |

#### TC-04 — 차폐 단락내량 FAIL

| 변경 | screenCsaMm2 = **22**, earthFaultKA = **10**, earthFaultTimeS = **0.5** |
|---|---|

**기대 결과**

| 항목 | 값 |
|---|---|
| 권장 도체 단면적 | 60 mm² |
| 차폐 필요 단면적 | **49.45 mm²** (= 10 000·√0.5 / 143) |
| 사용자 차폐 | 22 mm² |
| Screen status | `FAIL` |
| Overall | `FAIL` |

해설: 도체는 통과해도 차폐가 지락전류 적분치를 견디지 못하면 전체가 FAIL입니다. 차폐 CSA를 비워두면 dataset이 자동으로 60 mm² 케이블의 표준 차폐(22 mm²)를 가져오므로 동일하게 FAIL. 더 큰 도체 CSA를 사용하면 표준 차폐가 35/45/83 mm²로 증가해 통과 가능.

#### TC-05 — 충전전류 합산

| 변경 | apparentPowerMVA = **0.5**, lengthM = **5000** |
|---|---|

**기대 결과**

| 항목 | 값 |
|---|---|
| IB | 12.61 A |
| Ic | **6.97 A** (CNCV-W 60 mm²의 0.28 μF/km × 5 km) |
| Ic / IB | 55 % (≫ 1 % 임계값) |
| I_eff | **14.40 A** = √(12.61² + 6.97²) |
| 권장 단면적 | 60 mm² |
| 경고 | `W-MV-CHARGING-APPLIED` + `W-MV-CHARGING-CONSERVATIVE` |

해설: 장거리 + 저부하에서는 충전전류가 무시할 수 없는 비율을 차지합니다. 엔진이 자동으로 I_eff 모드로 전환하고 보수적 합산임을 경고합니다.

#### TC-06 — 보정계수 종합

| 변경 | ambientTempC = **35**, soilResistivityK_m_W = **3.0**, groupCount = **4**, burialDepthM = **1.2** |
|---|---|

**기대 결과**

| 항목 | 값 |
|---|---|
| k1 (지중온도 35 °C) | **0.91** |
| k2 (ρ = 3.0) | **0.75** |
| k3 (n=4 직매설) | **0.67** |
| k4 (1.2 m) | **0.96** |
| k_total | **0.439** |
| Iz (60 mm² × 0.439) | 116.3 A |
| 권장 단면적 | 60 mm² (IB가 작아 여전히 통과) |

해설: 가혹 조건에서 보정계수가 어떻게 합쳐지는지 확인하는 케이스. IB가 더 컸다면 단면적이 상향됐을 것입니다.

#### TC-07 — 관로(duct_bank) 그룹 4

| 변경 | installationMethod = **duct_bank**, groupCount = **4** |
|---|---|

**기대 결과**: k3가 직매설 column이 아닌 duct_bank column(0.73)에서 선택되어야 합니다. 결과 패널 Criteria 행에서 `k₃=0.73` 명시.

#### TC-08 — 정전용량 사용자 입력

| 변경 | Override capacitance = **0.5 μF/km**, lengthM = **5000** |
|---|---|

**기대 결과**: `W-MV-CAPACITANCE-OVERRIDE` 경고가 출력되고, dataset 값(0.28) 대신 사용자 입력값으로 Ic가 계산됩니다(약 1.25 A/km × 5 km ≈ 6.2 A).

#### TC-09 — 보호장치 차단용량 부족

| 변경 | breakingKA = **15**, shortCircuitKA = **25**, tripTimeS = **1** |
|---|---|

**기대 결과**

| 항목 | 값 |
|---|---|
| 권장 단면적 | **200 mm²** (도체 단락내량 ≥ 174.83 mm²) |
| Protection condition 1 (In ≥ IB) | PASS |
| Protection condition 2 (breaking ≥ Isc) | **FAIL** (15 < 25) |
| Overall | `FAIL` |

해설: 도체는 견디지만 차단기 자체가 단락전류를 끊지 못하므로 전체 FAIL. 차단기를 31.5 kA 이상으로 변경해야 합니다.

#### TC-10 — 차폐 검증 INCOMPLETE

| 변경 | (지락전류 입력 모두 비움 — TC-01과 동일) |
|---|---|

**기대 결과**: `W-MV-SCREEN-INCOMPLETE` 경고와 함께 차폐 항목이 INCOMPLETE 처리. 권장 단면적은 정상적으로 산정됩니다.

---

## 7. 경고·오류 코드 레퍼런스

### LV 경고
| Code | 의미 |
|---|---|
| W-DEFAULT-APPLIED | 누락된 선택 입력에 기본값 적용 |
| W-IB-OVERRIDE | (v1.x) 사용자가 IB를 직접 입력 (deprecated, W-CR-006와 동시 발생) |
| W-LOOKUP-SAFE-SIDE | 보정계수 lookup이 정확 일치가 아니라 보수적 이웃을 선택 |
| W-PROTECTION-RECHECK | 단면적이 단락보호 재확인 단계에서 상향 |
| W-I2-MISSING | I₂ 입력 누락 → 협조 INCOMPLETE |
| W-REACTANCE-IGNORED | 작은 csa에서 X = 0 처리 |
| W-TEMP-CORRECTION-APPLIED / -CAPPED | temperature_corrected 모드 적용 / θ_op 한계 도달 |
| W-CR-001 | (v1.3) 사용자가 `overrides.designCurrent`로 IB를 직접 입력 |
| W-CR-002 | (v1.3) ambientTemp 미입력 → 30 °C 기본 적용 |
| W-CR-003 | (v1.3) 매설 깊이 미입력 → 0.7 m 기본 적용 |
| W-CR-004 | (v1.3) 사용자가 외장 단면적을 override |
| W-CR-005 | (v1.3) 사용자가 loadedConductors를 override |
| W-CR-006 | (v1.3) `load.designCurrentOverrideA` deprecated → `overrides.designCurrent` 사용 권장 |
| W-CR-007 | (v1.3) 외장 단면적이 단락전류를 견디지 못함 (`S_arm_req` 초과) |
| W-CR-008 | (v1.3) 3ph4w + 중성선 부하 → loadedConductors=4 도출되었으나 ampacity 표는 3-loaded까지만 → k4 derating은 범위 외 |

### LV 정보 메시지 (Info — v1.3, 신규 채널)
| Code | 의미 |
|---|---|
| I-CR-001 | "중성선 부하 있음" 토글로 loadedConductors가 3 → 4로 자동 적용 (3φ4선식) |

### LV 오류
| Code | 의미 |
|---|---|
| E-VAL-001~010 | 입력 검증 실패 |
| E-LOOKUP-001 | 허용전류 조합 없음(예: F/G + multicore) |
| E-LOOKUP-002 | 보정계수 입력값 범위 밖 |
| E-LOOKUP-003 | 임피던스 csa 없음 |
| E-LOOKUP-004 | k 값 조합 없음 |
| E-CSA-001 | 필요 csa가 표준 ladder 최대 초과 |
| E-TEMP-AMBIENT-OVER-MAX | temperature_corrected 모드에서 ambient ≥ 도체 한계 |
| E-CR-101 | (v1.3) 지중 포설 시 토양 열저항 누락 — 침묵 기본값 미적용 정책 |

### MV 경고
| Code | 의미 |
|---|---|
| W-MV-DEFAULT-APPLIED | 누락 입력에 기본값 적용 |
| W-MV-IB-OVERRIDE | 사용자가 IB 직접 입력 |
| W-MV-LOOKUP-SAFE-SIDE | k1~k4 lookup이 보수적 이웃 사용 |
| W-MV-CHARGING-IGNORED / -APPLIED | Ic가 임계값 미만 → 무시 / 임계값 이상 → I_eff 적용 |
| W-MV-CHARGING-CONSERVATIVE | I_eff 합산이 위상상쇄 미반영 (Amendment 1) |
| W-MV-CAPACITANCE-OVERRIDE | 사용자가 정전용량 직접 입력 |
| W-MV-AMBIENT-DEFAULT | 지중온도 미입력 → 25 °C 기본 적용 |
| W-MV-SCREEN-AUTO-FILLED / -OVERRIDE / -INCOMPLETE | 차폐 자동조회 / 사용자 override / 지락전류 누락 |
| W-MV-PROTECTION-DISCLAIMER | 릴레이 협조는 검증 범위 밖 (항상 출력) |

### MV 오류
| Code | 의미 |
|---|---|
| E-MV-VAL-001 | 시스템 고정값(22 900 V / 13 200 V / 3ϕ / 60 Hz) 위반 |
| E-MV-VAL-002 | 부하 입력 누락 또는 범위 밖 |
| E-MV-VAL-003 | 거리 ≤ 0 |
| E-MV-VAL-004 | 토양 열저항 미입력 (기본값 미적용) |
| E-MV-VAL-005 | flat_spaced 배열인데 spacing 누락 |
| E-MV-VAL-006 | 지락전류 / 동작시간 중 한쪽만 입력 |
| E-MV-LOOKUP-001 | 허용전류 표 없음 (예: FR-CNCO-W + direct_buried) |
| E-MV-LOOKUP-002~004 | 임피던스 / 정전용량 / 차폐 row 없음 |
| E-MV-LOOKUP-005~008 | 그룹 / 온도 / 토양 / 깊이 입력값이 표 범위 초과 |
| E-MV-CSA-001 | 필요 단면적이 600 mm² 초과 |

---

## 8. FAQ / 자주 발생하는 상황

**Q. MV에서 늘 INCOMPLETE가 나옵니다.**
지락전류(Earth fault Ie + t)를 입력하지 않으면 차폐 검증이 INCOMPLETE 처리됩니다(정상). 만약 차폐 검증을 굳이 안 하려면 정책 섹션의 `Verify screen`을 끄세요.

**Q. LV `Method F/G` 단심 케이블인데 `E-LOOKUP-001`이 납니다.**
F/G는 단심 전용(Annex B.52.10–13)입니다. Cable type을 `single-core`로 바꾸세요. 동일하게 multicore에서 F/G를 고르면 dataset 조회가 실패합니다.

**Q. `W-LOOKUP-SAFE-SIDE`가 떴는데 결과를 신뢰해도 되나요?**
정확 일치 키가 없을 때 엔진이 보수적 이웃(더 큰 derating, 더 큰 단면적)을 자동 선택했다는 뜻입니다. 결과는 안전측이며, 더 정밀한 값을 원하면 입력값을 표의 키 중 하나(예: 30/35/40 °C, 1.0/1.5/2.0/2.5/3.0 K·m/W)에 맞추면 됩니다.

**Q. 결과의 audit trail은 어디에 쓰나요?**
설계 검토·보고서 첨부용 입니다. 각 단계의 `formula`, `intermediateValues`, `decision`, `reason`이 그대로 노출되므로 외부 검수자가 사이징 근거를 그대로 추적할 수 있습니다. v1.3부터는 각 단계의 `derivedFields[]` 배열에 도출값별 출처(FieldState)도 함께 표시되어 "이 값이 공식에서 나왔는지 / 데이터셋에서 나왔는지 / 사용자가 덮어쓴 값인지"를 한눈에 볼 수 있습니다.

**Q. (v1.3) Override 토글을 끄면 입력했던 값은 어떻게 되나요?**
세션 동안 메모리에 보존됩니다. 같은 세션에서 토글을 다시 켜면 이전 값이 입력 칸에 복원됩니다. 페이지를 새로고침하거나 닫으면 폐기됩니다 (저장 기능은 v1.3 범위 외 — CR-OQ-4).

**Q. (v1.3) `motor`로 바꿨더니 P_kW가 사라졌습니다.**
모터는 FLA(Full-Load Amps)가 우선 입력입니다. P_kW가 필요하면 Load 패널 안의 "Power input fallback" details를 펼치세요. FLA 미입력 시 fallback인 P_kW 경로로 IB가 계산됩니다.

**Q. (v1.3) "loadedConductors=4" 경고(W-CR-008)가 떴는데 정상인가요?**
3φ4선식에서 "Neutral carries current"를 켜면 도체 4개에 부하전류가 흐르는 것으로 도출됩니다 (I-CR-001). 그러나 IEC 60364-5-52 Annex B의 ampacity 표는 2-loaded와 3-loaded만 가지고 있어 v1.3에서는 3-loaded 표를 사용하면서 W-CR-008로 그 한계를 알립니다. 고조파 derating(k4)이 필요한 경우는 별도 설계 검토가 필요합니다.

**Q. 데이터셋의 출처는 어디인가요?**
- LV: IEC 60364-5-52 Annex B(Schneider Electric Electrical Installation Guide 기반) — `meta.json` 참조.
- MV: KEPCO ES 6145-0027 + LS전선 / 대한전선 / 강원전선 카탈로그 — `mv_22kv_kr_v1/meta.json` 참조 (`status: "approved"`).

---

## 9. 사양 문서 / 기술 자료

| 자료 | 위치 |
|---|---|
| MV PRD (요구사항) | `고압/PRD_22.9kV_MV_Cable_Sizing_v1.2_FINAL (1).md` |
| MV 계산 사양 | `고압/MV_Calculation_Specification_v0.2.md` |
| MV 수정사항 (보수적 합산, 차폐 auto-fill) | `고압/MV_Amendment_1_Expert_Feedback.md` |
| MV 데이터 거버넌스 (Source Blocking Rule) | `고압/MV_Amendment_2_Source_Block_Policy.md` |
| LV v1.3 입력 자동화 설계변경서 | `저압 설계변경서/Design_Change_LV_Cable_Sizing_Input_Automation_v1.3_FINAL.md` |
| LV v1.3 구현 사양 | `저압 설계변경서/Implementation_Spec_LV_v2.0.md` |
| 엔진 변경이력 / 버전 정책 | `cable-sizing/packages/engine/CHANGELOG.md`, `docs/versioning-policy.md` |
| 데이터셋 매트릭스 | `cable-sizing/packages/engine/docs/dataset-matrix.md` |
| Worker 프로토콜 v1 | `cable-sizing/packages/engine/docs/worker-protocol.md` |

엔진 출력의 모든 수치는 위 문서의 공식과 일대일 대응되며, 본 설명서의 검증 케이스는 다음 자동 테스트와 동일한 입력·기대값을 사용합니다.

- LV 정확성 (GC-LV-01..15) + 자동화 동작 (GC-LV-AUTO-01..05): `packages/engine/src/orchestrator/fixtures/*.json`
- MV Golden Cases: `packages/engine/src/mv/golden-cases.test.ts`
- v1.x → v1.5 마이그레이션 정책 (MIG-TC-01..04): `packages/engine/src/migration/fixtures/*.json`
- 사이드카(FieldState) 호환성 회귀 (AC-17/18): `packages/engine/src/api/sidecar-compat.test.ts`

즉 **본 설명서에 적힌 결과는 CI에서 매번 검증**됩니다 (총 616 tests).
