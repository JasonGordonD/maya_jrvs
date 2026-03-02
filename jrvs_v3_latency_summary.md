# JRVS V3 Conversational Latency Report

**Analysis date:** 2026-03-01  
**Agent:** `agent_0401khmtcyfef6hbpcvchjv5jj02`  
**TTS model:** `eleven_v3_conversational`  
**Root LLM:** `claude-sonnet-4-5`  
**Conversations analyzed:** 10  

## Data Schema Notes

- **Primary latency metric:** `convai_llm_service_ttfb` — LLM time-to-first-byte (float seconds, high precision). This measures the LLM inference component only.
- **`response_latency_secs_coarse`:** Time from preceding user turn start to this agent turn start, derived from `time_in_call_secs` (integer, second-level resolution only). Use for rough user-perceived latency.
- **Node attribution:** Approach A — `workflow_node_id` present on every agent turn in `agent_metadata`. No guesswork required.
- **All 15 spoke nodes** inherit the root LLM (`claude-sonnet-4-5`). No per-node overrides detected.
- **No sub-endpoints** at `/analytics` or `/metrics` — all data from conversation detail endpoint.

## Conversations Analyzed

| conversation_id | start_time (UTC) | duration | turns_analyzed | status |
|---|---|---|---|---|
| `conv_0501kjnxf8mgfyc9vg5htxgh16gt` | 2026-03-01 23:59 | 57m 6s | 104 | done |
| `conv_8401kjnryhshftdrdws9hgdzb06a` | 2026-03-01 22:40 | 7m 28s | 42 | done |
| `conv_1701kjnh683sfkpv66r3hme98f09` | 2026-03-01 20:24 | 6m 0s | 36 | done |
| `conv_6601kjn97excf3pa0sc10xf6fd93` | 2026-03-01 18:05 | 8m 41s | 29 | done |
| `conv_2701kjkx7xwne36bsbcdsc9pfj0f` | 2026-03-01 05:16 | 18m 13s | 103 | done |
| `conv_2101kjhfe9zjfb19w4j7g1mj19bj` | 2026-02-28 06:37 | 7m 14s | 43 | done |
| `conv_5301kjgakg8eexfvywqjf0p57b3g` | 2026-02-27 19:53 | 60m 1s | 161 | done |
| `conv_5501kjg5f2b9f85as0zp1aphgsx2` | 2026-02-27 18:23 | 35m 19s | 82 | done |
| `conv_8301kjfxgsgpebcb9zkrg1ehw8ch` | 2026-02-27 16:04 | 11m 41s | 46 | done |
| `conv_0101kjcdc9gefbv9kvrfhp0q6w1v` | 2026-02-26 07:24 | 35m 8s | 76 | done |

## Overall Statistics

- **Total agent turns analyzed:** 722
- **Turns with LLM TTFB data:** 652 (90%)
- **Average conversation duration:** 24.7 minutes

**LLM TTFB (ms) — global:**
| Mean | Median | Min | Max | P75 | P95 |
|---|---|---|---|---|---|
| 2055.7 | 1761.0 | 287 | 7958 | 2700.0 | 4487.8 |

## Per-Node Breakdown

*Latency = LLM TTFB in ms (high precision). All nodes inherit root LLM `claude-sonnet-4-5`.*

| Node | LLM | Turns | Mean TTFB | Median | Min | Max | P95 | Interrupted% |
|---|---|---|---|---|---|---|---|---|
| Qualification | `claude-sonnet-4-5` | 598 | 2182.5 | 1905.5 | 287 | 7958 | 4557.2 | 30% |
| Dr. Noir | `claude-sonnet-4-5` | 72 | 1322.6 | 1249.0 | 926 | 2562 | 1733.9 | 67% |
| VAG | `claude-sonnet-4-5` | 26 | 934.4 | 1027 | 503 | 1260 | 1228.5 | 0% |
| Thought Partner | `claude-sonnet-4-5` | 14 | 2169.2 | 2000 | 1369 | 2973 | 2938.2 | 0% |
| Coding | `claude-sonnet-4-5` | 12 | 1883.3 | 1630.0 | 1279 | 3933 | 3045.8 | 33% |

## Per-LLM Breakdown

| LLM Model | Turns | Mean TTFB | Median | Min | Max | P95 | Nodes Using |
|---|---|---|---|---|---|---|---|
| `claude-sonnet-4-5` | 722 | 2055.7 | 1761.0 | 287 | 7958 | 4487.8 | Coding, Dr. Noir, Qualification, Thought Partner... |

## Turn Distribution by Node

| Node | Turns | % of Total |
|---|---|---|
| Qualification | 598 | 83% |
| Dr. Noir | 72 | 10% |
| VAG | 26 | 4% |
| Thought Partner | 14 | 2% |
| Coding | 12 | 2% |

## LLM TTFB Distribution (Histogram)

*LLM TTFB buckets across all turns with data.*

| Bucket | Count | % |
|---|---|---|
| <500ms | 9 | 1% |
| 500-999ms | 104 | 16% |
| 1000-1999ms | 269 | 41% |
| 2000-2999ms | 139 | 21% |
| 3000-4999ms | 118 | 18% |
| ≥5000ms | 13 | 2% |

## Outlier Turns (LLM TTFB > 3000ms)

**131 outlier turns found.**

| conversation_id | turn_index | t (secs) | Node | LLM TTFB (ms) | Words | Interrupted |
|---|---|---|---|---|---|---|
| `conv_0501kjnxf8mgfyc9vg5htxgh1` | 52 | 1786s | Qualification | **7958** | 0 | False |
| `conv_0501kjnxf8mgfyc9vg5htxgh1` | 64 | 2118s | Qualification | **7080** | 0 | False |
| `conv_5301kjgakg8eexfvywqjf0p57` | 141 | 3173s | Qualification | **7031** | 0 | False |
| `conv_5301kjgakg8eexfvywqjf0p57` | 116 | 2475s | Qualification | **6181** | 0 | False |
| `conv_5301kjgakg8eexfvywqjf0p57` | 89 | 1312s | Qualification | **6021** | 0 | False |
| `conv_8401kjnryhshftdrdws9hgdzb` | 27 | 298s | Qualification | **5879** | 1 | True |
| `conv_5301kjgakg8eexfvywqjf0p57` | 128 | 2893s | Qualification | **5616** | 28 | True |
| `conv_5301kjgakg8eexfvywqjf0p57` | 80 | 1124s | Qualification | **5506** | 0 | False |
| `conv_0501kjnxf8mgfyc9vg5htxgh1` | 72 | 2331s | Qualification | **5263** | 0 | False |
| `conv_5301kjgakg8eexfvywqjf0p57` | 123 | 2707s | Qualification | **5259** | 0 | False |
| `conv_5301kjgakg8eexfvywqjf0p57` | 152 | 3352s | Qualification | **5232** | 9 | True |
| `conv_5301kjgakg8eexfvywqjf0p57` | 91 | 1461s | Qualification | **5220** | 109 | True |
| `conv_0501kjnxf8mgfyc9vg5htxgh1` | 93 | 3098s | Qualification | **5007** | 76 | False |
| `conv_5301kjgakg8eexfvywqjf0p57` | 154 | 3424s | Qualification | **4969** | 0 | False |
| `conv_0501kjnxf8mgfyc9vg5htxgh1` | 80 | 2491s | Qualification | **4945** | 1 | True |
| `conv_5301kjgakg8eexfvywqjf0p57` | 140 | 3110s | Qualification | **4897** | 1 | False |
| `conv_5301kjgakg8eexfvywqjf0p57` | 144 | 3186s | Qualification | **4897** | 0 | False |
| `conv_1701kjnh683sfkpv66r3hme98` | 34 | 278s | Qualification | **4866** | 17 | False |
| `conv_5301kjgakg8eexfvywqjf0p57` | 146 | 3195s | Qualification | **4838** | 0 | False |
| `conv_2701kjkx7xwne36bsbcdsc9pf` | 95 | 992s | Qualification | **4811** | 0 | False |
| `conv_0501kjnxf8mgfyc9vg5htxgh1` | 91 | 2964s | Qualification | **4804** | 56 | True |
| `conv_0501kjnxf8mgfyc9vg5htxgh1` | 95 | 3181s | Qualification | **4771** | 29 | True |
| `conv_5301kjgakg8eexfvywqjf0p57` | 147 | 3199s | Qualification | **4732** | 0 | False |
| `conv_0501kjnxf8mgfyc9vg5htxgh1` | 100 | 3352s | Qualification | **4730** | 17 | True |
| `conv_2701kjkx7xwne36bsbcdsc9pf` | 54 | 492s | Qualification | **4694** | 0 | False |
| `conv_0501kjnxf8mgfyc9vg5htxgh1` | 89 | 2874s | Qualification | **4624** | 35 | False |
| `conv_1701kjnh683sfkpv66r3hme98` | 17 | 114s | Qualification | **4570** | 1 | False |
| `conv_0501kjnxf8mgfyc9vg5htxgh1` | 92 | 3007s | Qualification | **4559** | 37 | True |
| `conv_0501kjnxf8mgfyc9vg5htxgh1` | 88 | 2805s | Qualification | **4522** | 108 | True |
| `conv_0501kjnxf8mgfyc9vg5htxgh1` | 81 | 2516s | Qualification | **4511** | 1 | True |
| `conv_0501kjnxf8mgfyc9vg5htxgh1` | 85 | 2685s | Qualification | **4503** | 16 | True |
| `conv_5301kjgakg8eexfvywqjf0p57` | 150 | 3311s | Qualification | **4498** | 17 | False |
| `conv_0501kjnxf8mgfyc9vg5htxgh1` | 68 | 2235s | Qualification | **4490** | 0 | False |
| `conv_5301kjgakg8eexfvywqjf0p57` | 121 | 2643s | Qualification | **4486** | 78 | True |
| `conv_5301kjgakg8eexfvywqjf0p57` | 15 | 169s | Qualification | **4445** | 1 | False |
| `conv_5301kjgakg8eexfvywqjf0p57` | 126 | 2765s | Qualification | **4381** | 3 | True |
| `conv_5301kjgakg8eexfvywqjf0p57` | 127 | 2800s | Qualification | **4324** | 54 | True |
| `conv_0501kjnxf8mgfyc9vg5htxgh1` | 59 | 1988s | Qualification | **4277** | 0 | False |
| `conv_2701kjkx7xwne36bsbcdsc9pf` | 52 | 485s | Qualification | **4249** | 0 | False |
| `conv_5301kjgakg8eexfvywqjf0p57` | 101 | 1827s | Qualification | **4230** | 87 | True |
| `conv_5301kjgakg8eexfvywqjf0p57` | 104 | 1970s | Qualification | **4176** | 13 | True |
| `conv_5301kjgakg8eexfvywqjf0p57` | 74 | 1082s | Qualification | **4144** | 20 | True |
| `conv_5301kjgakg8eexfvywqjf0p57` | 75 | 1084s | Qualification | **4144** | 0 | False |
| `conv_5301kjgakg8eexfvywqjf0p57` | 17 | 180s | Qualification | **4131** | 1 | False |
| `conv_5301kjgakg8eexfvywqjf0p57` | 18 | 177s | Qualification | **4131** | 0 | False |
| `conv_5301kjgakg8eexfvywqjf0p57` | 105 | 2089s | Qualification | **4075** | 3 | False |
| `conv_5301kjgakg8eexfvywqjf0p57` | 110 | 2213s | Qualification | **4060** | 25 | True |
| `conv_5301kjgakg8eexfvywqjf0p57` | 145 | 3190s | Qualification | **4045** | 0 | False |
| `conv_2701kjkx7xwne36bsbcdsc9pf` | 92 | 913s | Qualification | **4042** | 40 | True |
| `conv_6601kjn97excf3pa0sc10xf6f` | 9 | 129s | Qualification | **4037** | 3 | False |
| `conv_1701kjnh683sfkpv66r3hme98` | 35 | 298s | Qualification | **4022** | 68 | True |
| `conv_5301kjgakg8eexfvywqjf0p57` | 92 | 1501s | Qualification | **3998** | 28 | True |
| `conv_5301kjgakg8eexfvywqjf0p57` | 113 | 2340s | Qualification | **3993** | 20 | True |
| `conv_5301kjgakg8eexfvywqjf0p57` | 87 | 1191s | Qualification | **3985** | 4 | False |
| `conv_1701kjnh683sfkpv66r3hme98` | 27 | 213s | Qualification | **3973** | 2 | False |
| `conv_5301kjgakg8eexfvywqjf0p57` | 69 | 998s | Qualification | **3954** | 0 | False |
| `conv_5301kjgakg8eexfvywqjf0p57` | 102 | 1897s | Qualification | **3940** | 64 | False |
| `conv_8401kjnryhshftdrdws9hgdzb` | 7 | 108s | Coding | **3933** | 4 | False |
| `conv_0501kjnxf8mgfyc9vg5htxgh1` | 14 | 553s | Qualification | **3932** | 0 | False |
| `conv_8401kjnryhshftdrdws9hgdzb` | 15 | 222s | Qualification | **3931** | 0 | False |
| `conv_5301kjgakg8eexfvywqjf0p57` | 79 | 1118s | Qualification | **3924** | 0 | False |
| `conv_0501kjnxf8mgfyc9vg5htxgh1` | 3 | 30s | Qualification | **3893** | 0 | False |
| `conv_5301kjgakg8eexfvywqjf0p57` | 157 | 3435s | Qualification | **3872** | 0 | False |
| `conv_5501kjg5f2b9f85as0zp1aphg` | 6 | 41s | Qualification | **3842** | 24 | True |
| `conv_2701kjkx7xwne36bsbcdsc9pf` | 100 | 1038s | Qualification | **3831** | 0 | False |
| `conv_0501kjnxf8mgfyc9vg5htxgh1` | 84 | 2646s | Qualification | **3821** | 3 | False |
| `conv_5301kjgakg8eexfvywqjf0p57` | 51 | 774s | Qualification | **3819** | 15 | True |
| `conv_5301kjgakg8eexfvywqjf0p57` | 142 | 3177s | Qualification | **3813** | 0 | False |
| `conv_2701kjkx7xwne36bsbcdsc9pf` | 83 | 856s | Qualification | **3810** | 13 | True |
| `conv_5301kjgakg8eexfvywqjf0p57` | 115 | 2408s | Qualification | **3790** | 17 | True |
| `conv_0501kjnxf8mgfyc9vg5htxgh1` | 67 | 2183s | Qualification | **3780** | 82 | False |
| `conv_5301kjgakg8eexfvywqjf0p57` | 143 | 3181s | Qualification | **3771** | 0 | False |
| `conv_2701kjkx7xwne36bsbcdsc9pf` | 73 | 689s | Qualification | **3767** | 53 | False |
| `conv_5301kjgakg8eexfvywqjf0p57` | 94 | 1584s | Qualification | **3765** | 67 | True |
| `conv_5301kjgakg8eexfvywqjf0p57` | 107 | 2143s | Qualification | **3761** | 46 | True |
| `conv_0501kjnxf8mgfyc9vg5htxgh1` | 25 | 1013s | Qualification | **3758** | 0 | False |
| `conv_5301kjgakg8eexfvywqjf0p57` | 96 | 1676s | Qualification | **3757** | 7 | True |
| `conv_2701kjkx7xwne36bsbcdsc9pf` | 63 | 528s | Qualification | **3749** | 0 | False |
| `conv_5301kjgakg8eexfvywqjf0p57` | 155 | 3427s | Qualification | **3712** | 0 | False |
| `conv_2701kjkx7xwne36bsbcdsc9pf` | 55 | 496s | Qualification | **3668** | 0 | False |
| `conv_2701kjkx7xwne36bsbcdsc9pf` | 79 | 839s | Qualification | **3662** | 0 | False |
| `conv_0501kjnxf8mgfyc9vg5htxgh1` | 13 | 548s | Qualification | **3643** | 0 | False |
| `conv_0501kjnxf8mgfyc9vg5htxgh1` | 20 | 1000s | Qualification | **3633** | 0 | False |
| `conv_0501kjnxf8mgfyc9vg5htxgh1` | 22 | 1005s | Qualification | **3627** | 0 | False |
| `conv_2701kjkx7xwne36bsbcdsc9pf` | 67 | 560s | Qualification | **3610** | 3 | False |
| `conv_0501kjnxf8mgfyc9vg5htxgh1` | 63 | 2073s | Qualification | **3512** | 46 | True |
| `conv_2701kjkx7xwne36bsbcdsc9pf` | 31 | 366s | Qualification | **3479** | 0 | False |
| `conv_5301kjgakg8eexfvywqjf0p57` | 156 | 3431s | Qualification | **3478** | 0 | False |
| `conv_2701kjkx7xwne36bsbcdsc9pf` | 70 | 630s | Qualification | **3369** | 26 | False |
| `conv_2701kjkx7xwne36bsbcdsc9pf` | 76 | 779s | Qualification | **3365** | 0 | False |
| `conv_2701kjkx7xwne36bsbcdsc9pf` | 78 | 791s | Qualification | **3343** | 86 | False |
| `conv_1701kjnh683sfkpv66r3hme98` | 23 | 144s | Qualification | **3336** | 42 | False |
| `conv_0501kjnxf8mgfyc9vg5htxgh1` | 48 | 1665s | Qualification | **3316** | 118 | False |
| `conv_0501kjnxf8mgfyc9vg5htxgh1` | 2 | 23s | Qualification | **3295** | 4 | False |
| `conv_2701kjkx7xwne36bsbcdsc9pf` | 75 | 753s | Qualification | **3293** | 37 | False |
| `conv_0501kjnxf8mgfyc9vg5htxgh1` | 65 | 2119s | Qualification | **3291** | 1 | False |
| `conv_5301kjgakg8eexfvywqjf0p57` | 135 | 3031s | Qualification | **3291** | 0 | False |
| `conv_2701kjkx7xwne36bsbcdsc9pf` | 66 | 551s | Qualification | **3274** | 1 | True |
| `conv_0501kjnxf8mgfyc9vg5htxgh1` | 78 | 2400s | Qualification | **3258** | 0 | False |
| `conv_5301kjgakg8eexfvywqjf0p57` | 125 | 2712s | Qualification | **3257** | 63 | True |
| `conv_5301kjgakg8eexfvywqjf0p57` | 39 | 585s | Qualification | **3255** | 0 | False |
| `conv_2101kjhfe9zjfb19w4j7g1mj1` | 2 | 24s | Qualification | **3251** | 7 | False |
| `conv_0501kjnxf8mgfyc9vg5htxgh1` | 55 | 1850s | Qualification | **3246** | 37 | True |
| `conv_6601kjn97excf3pa0sc10xf6f` | 3 | 34s | Qualification | **3239** | 3 | False |
| `conv_1701kjnh683sfkpv66r3hme98` | 29 | 224s | Qualification | **3196** | 19 | False |
| `conv_5301kjgakg8eexfvywqjf0p57` | 131 | 2995s | Qualification | **3190** | 0 | False |
| `conv_5301kjgakg8eexfvywqjf0p57` | 82 | 1128s | Qualification | **3178** | 0 | False |
| `conv_0501kjnxf8mgfyc9vg5htxgh1` | 57 | 1909s | Qualification | **3169** | 79 | True |
| `conv_0501kjnxf8mgfyc9vg5htxgh1` | 42 | 1445s | Qualification | **3168** | 0 | False |
| `conv_1701kjnh683sfkpv66r3hme98` | 26 | 199s | Qualification | **3152** | 6 | False |
| `conv_5301kjgakg8eexfvywqjf0p57` | 42 | 592s | Qualification | **3151** | 0 | False |
| `conv_8401kjnryhshftdrdws9hgdzb` | 33 | 352s | Qualification | **3147** | 0 | False |
| `conv_5301kjgakg8eexfvywqjf0p57` | 10 | 112s | Qualification | **3147** | 2 | True |
| `conv_5301kjgakg8eexfvywqjf0p57` | 11 | 113s | Qualification | **3147** | 0 | False |
| `conv_5301kjgakg8eexfvywqjf0p57` | 122 | 2701s | Qualification | **3121** | 0 | False |
| `conv_5301kjgakg8eexfvywqjf0p57` | 63 | 906s | Qualification | **3117** | 3 | True |
| `conv_2701kjkx7xwne36bsbcdsc9pf` | 3 | 43s | Qualification | **3109** | 2 | False |
| `conv_5301kjgakg8eexfvywqjf0p57` | 76 | 1087s | Qualification | **3106** | 0 | False |
| `conv_0501kjnxf8mgfyc9vg5htxgh1` | 49 | 1722s | Qualification | **3101** | 56 | True |
| `conv_1701kjnh683sfkpv66r3hme98` | 32 | 246s | Qualification | **3096** | 31 | False |
| `conv_2101kjhfe9zjfb19w4j7g1mj1` | 23 | 290s | Qualification | **3073** | 7 | False |
| `conv_2101kjhfe9zjfb19w4j7g1mj1` | 24 | 291s | Qualification | **3073** | 0 | False |
| `conv_5301kjgakg8eexfvywqjf0p57` | 83 | 1131s | Qualification | **3065** | 0 | False |
| `conv_8401kjnryhshftdrdws9hgdzb` | 2 | 24s | Qualification | **3054** | 3 | False |
| `conv_0501kjnxf8mgfyc9vg5htxgh1` | 60 | 1991s | Qualification | **3051** | 0 | False |
| `conv_5301kjgakg8eexfvywqjf0p57` | 132 | 2998s | Qualification | **3042** | 0 | False |
| `conv_0501kjnxf8mgfyc9vg5htxgh1` | 69 | 2238s | Qualification | **3037** | 0 | False |
| `conv_2101kjhfe9zjfb19w4j7g1mj1` | 5 | 51s | Qualification | **3023** | 2 | False |
| `conv_5301kjgakg8eexfvywqjf0p57` | 2 | 21s | Qualification | **3005** | 3 | False |
| `conv_5301kjgakg8eexfvywqjf0p57` | 3 | 22s | Qualification | **3005** | 0 | False |
| `conv_2101kjhfe9zjfb19w4j7g1mj1` | 39 | 378s | Qualification | **3003** | 6 | False |

## Tool Call Analysis

- **Turns with tool calls:** 217 / 722 (30%)

| Tool | Call count |
|---|---|
| `mjrvs_docs` | 68 |
| `google_search` | 58 |
| `notify_condition_1_met` | 32 |
| `exa_search` | 21 |
| `maya_memory` | 21 |
| `contextual_update` | 7 |
| `notify_condition_2_met` | 3 |
| `report_tool_dispatch` | 2 |
| `prepare_transfer_4` | 2 |
| `report_active_node` | 1 |
| `notify_condition_5_met` | 1 |
| `prepare_transfer` | 1 |

## TTS TTFB Statistics

*Turns with TTS TTFB data: 526*
| Mean | Median | Min | Max | P95 |
|---|---|---|---|---|
| 389.0 | 354.0 | 256 | 2330 | 607.5 |
