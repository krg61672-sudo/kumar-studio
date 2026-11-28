# Kumar Studio — Production Readiness Gates

Status: **Not yet certified production-ready**. This document is a test specification, not a claim of completed functionality.

## Non-regression
- Preserve existing character creator, rigging, left/right fingers, weapon grips, archery, motion presets, BVH, GLB export, Blender bridge, pre-production planning, and capture add-on.
- Never overwrite the last known working studio without a tested rollback path.

## Animation acceptance tests (actual 3D viewport)
1. **Neutral pose:** at shoulder lift 0, arms rest naturally by the sides; elbow 0 produces straight arms; fingers relaxed, not twisted.
2. **Hands:** left and right fingers bend anatomically, mirrored correctly; fist closes before punch contact and opens only after recovery; weapon grips still work.
3. **Locomotion:** walking covers at least 3–4 forward steps with true root displacement, foot contact, heel-to-toe roll, no foot skating, weight transfer, arm counter-swing, and stable stopping.
4. **Idle and dialogue:** breathing, natural sway, gaze, head nods, turns, listening reactions, blinking, facial expression and phoneme-aligned lip sync.
5. **Combat:** anticipation, hip/shoulder rotation, guard, fist closure, contact timing, target reaction, recoil and recovery; no mesh intersections.
6. **Continuity:** one scene coordinate system, persistent characters/props, persistent light setup, seamless transitions between actions; camera cuts do not reset pose or positions.
7. **Timeline:** support continuous multi-minute scene performances, independent camera cuts, synchronized dialogue/audio, editable action curves, and deterministic scrubbing.
8. **Export:** animated GLB import/export round trip; exported footage verified in external player; capture includes audio if promised.

## Verification
For every test record: browser/device, character asset, reproduction steps, expected/observed outcome, viewport screenshot or capture, regression result and commit SHA. A JavaScript syntax check alone does not pass a 3D animation test.

## 10-minute Academy scene acceptance
A single 600-second scene timeline with connected environments and persistent Dhruv/Ranvijay identities. The punch confrontation must be continuous, not separately generated 15-second clips spliced without motion continuity.

## Release gate
Call the studio **complete** only after all required tests pass on the actual rig, in the browser, and the exported media is independently checked.

## Mandatory Blender integration (user requirement)
- Keep the browser Studio fully functional while adding Python/Blender processing.
- Support MakeHuman 163-bone rigs and preserve hand/finger articulation and weapon grips.
- Export character and motion as GLB/BVH; retarget to Blender rigs, process with IK and anatomical limits, re-import animated GLB for preview.
- Verify actual Blender processing and return round-trip on a real rig; do not treat bridge UI or syntax-only tests as complete.

## Mandatory blocking system (user requirement)
- **Character blockout:** create original characters from editable primitives/blocking shapes, refine into production models.
- **Scene blocking:** place actors, props, sets, cameras; persist positions through the entire scene.
- **Combat blocking:** arrange contact, anticipation, impact, dodge, reactions, recovery and safe spacing.
- **Pose/action library:** editable natural standing, walking, running, sitting, speaking and fighting poses.
- **Animation authoring:** manual and automatic keyframing, editable timeline, action sequencer, interpolation, transition blending, IK, mocap, audio/dialogue synchronization.
- **Review controls:** preview/apply/reject, undo/redo and reliable saved projects.
- Blocked performances must remain editable and transfer to the final rig without replacing the character identity or resetting scene coordinates.

## V6.0 virtual controls QA

The three panels start disabled independently. The settings button in the Studio header opens their activation, sensitivity and appearance controls. Object and component edits use the Studio geometry history. The viewport grants an active edit gesture priority over competing gestures on that surface.

The [browser runner](../tests/virtual-controls.cjs) checks the Studio UI in Chromium using its actual WebGL canvas, editable BoxGeometry meshes, and the official MakeHuman mesh, skeleton and weights. Camera coordinates, mesh positions and vertices, emitted mouse events, pose changes and saved settings are asserted directly. The runner uses locally cached copies of the published Three.js dependencies and MakeHuman assets to make repeated runs independent of network timing.

| Workflow | Status | Evidence |
|---|---|---|
| Virtual mouse | PASS | Cursor tracking, left selection, middle and right events, Studio context menu, double-click, wheel, zoom, Ctrl/Shift/Alt events, precision and boost, component multi-selection and drag-lock sculpting |
| Left joystick | PASS | Orbit, pan and zoom changed the expected camera state. The state stopped changing after release. |
| Right joystick and modeling | PASS | Object Move, Rotate and Scale changed separate properties. X-locked vertex movement touched only X coordinates. A single Undo/Redo restored each geometry state. The dead zone prevented movement. |
| Touch coexistence | PASS | Native touch still navigated the viewport. The runner exercised both joysticks and the mouse touchpad together and held virtual left-click while moving the pad. |
| Rigging and animation | PARTIAL | MakeHuman rig creation, joint rotation, character positioning, weapon-grip control, Walk playback and action-sequencer scrubbing passed on desktop. Other capture and animation workflows remain open in the release audit. |
| Sensitivity and customization | PASS | All 14 sliders were changed and checked against storage. Precision, boost, dead zone and three presets were exercised. Independent activation, handedness, size, opacity, panel drag, minimize, reload persistence and default reset were checked. |
| Geometry regression | PASS | Bevel, Loop Cut, multi-point Knife, automatic quad retopology and Boolean Union ran in the existing desktop workspace. |
| Browser and performance coverage | PARTIAL | Desktop, phone portrait, tablet portrait and phone landscape were exercised in Chromium with software WebGL. This runner records JavaScript heap usage and an idle frame sample. Dense scene, GPU memory and long-session profiling remain open. |
| Physical device and browser engine coverage | NOT TESTED | iPad Air 4 Safari, Realme 11x Android hardware, and non-Chromium desktop engines. |
| Complete Studio release audit | PARTIAL | The focused regression checks above passed. The remaining production readiness gates in this document remain open. |

The virtual pointer sends events inside the Studio. Its context menu is Studio-specific. Browser-level actions such as operating system dialogs are outside the pointer test coverage.

### Reproducing the browser checks

```sh
npm install --prefix /tmp/ks-deps three@0.160.0 three-mesh-bvh@0.7.6 manifold-3d@3.5.5 playwright-core @sparticuz/chromium
asset_root=https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data
curl -fsSL "$asset_root/3dobjs/base.obj" -o /tmp/ks-base.obj
curl -fsSL "$asset_root/rigs/default.mhskel" -o /tmp/ks-default.mhskel
curl -fsSL "$asset_root/rigs/default_weights.mhw" -o /tmp/ks-default_weights.mhw
node tests/virtual-controls.cjs
node tests/virtual-controls.cjs phone
node tests/virtual-controls.cjs tablet
node tests/virtual-controls.cjs landscape
```

The runner accepts alternative paths through `KUMAR_QA_DEPS`, `KUMAR_QA_ASSETS` and `KUMAR_QA_CHROMIUM`.

## Extended rig, export and dense-mesh QA

The extended browser runner uses the official MakeHuman mesh and its 163-joint skeleton. Coordinates are in Studio world units.

| Workflow | Status | Observed evidence |
|---|---|---|
| Bilateral fist and punch midpoint | PASS | Mean finger-end distance to wrist changed from 0.1530 to 0.0878 on both sides. At punch midpoint both measurements were 57.4% of the open-hand distance. All skinned vertices remained finite. |
| Natural Standing | PASS | In a separate browser spot-check, each upper-arm vector had a 0.992 dot product with vertical down, and each elbow had a 1.000 alignment between upper arm and forearm. |
| Four-step Walk | PASS | Horizontal root travel was 0.9255. Sampled support-foot drift was at most 0.0051 on the final run. The check covers the sampled phases and the numerical criteria above. |
| Recorded BVH scrub | PASS | The sample loaded through the Studio file input and scrubbing changed the MakeHuman bone rotations. |
| Animated GLB and Blender round trip | PASS | The Studio export included 163 joints and 326 animation channels. Blender 4.3.2 processed 1 rig, 2 meshes and 1 action. The processed GLB re-imported and its bone animation played in Studio. |
| Preview resource cleanup and dense editing history | PASS | Removing the animated preview returned renderer resource counts to baseline. A 41,184-triangle mesh completed 40 Move/Undo/Redo cycles with renderer counts stable at 22 geometries and 2 textures. GC-sampled JavaScript heap was 12.8 MiB before and 12.3 MiB after. |
| Performance and hardware | PARTIAL | The dense software-WebGL run had a 149.9 ms p95 frame interval during the mixed input/history workload. Physical iPad Air 4, Realme 11x and driver-level GPU memory were not tested. |
| Visual and production certification | PARTIAL | Full-frame foot contact, anatomical finger and punch deformation, multi-minute scenes and other release gates still need broader verification. |

Run the extended suite after installing the Chromium dependencies and the MakeHuman fixtures listed above.

```sh
curl -fsSL https://threejs.org/examples/models/bvh/pirouette.bvh -o /tmp/ks-pirouette.bvh
KUMAR_QA_EXTENDED=1 KUMAR_QA_BLENDER=/usr/bin/blender node tests/virtual-controls.cjs
```

Omit `KUMAR_QA_BLENDER` to check the direct browser export/import path.

## Natural Movement Quality visual review

**Status PARTIAL.** The visual runner renders the actual MakeHuman skinned character and Studio poses into four synchronized cameras. This review included 22 takes at 25 sampled poses per take. Frame grids were inspected from front, side, back and three-quarter views. The evidence uses the same evaluated poses as the Studio timeline, with a temporary neutral material. The recordings are silent, with slowed playback and normalized timeline labels. Static hand presets are held for inspection.

### Movement references

- Carnegie Mellon Motion Capture Database human trials [02_01 Walk, 02_03 Run, and 02_04 Jump](https://github.com/tenzin3/human-motion-dataset/tree/master/data/002) were rendered as source skeletons for visual comparison. These reference clips have different subjects, timings and proportions from the Studio mannequin.
- [Rancho Los Amigos gait phases](https://www.ouhsc.edu/bserdac/dthompso/web/gait/terms.htm) guided support and swing review. [Novacheck's running review](https://pubmed.ncbi.nlm.nih.gov/10200378/) informed the distinction between walking and running. [Chair-rise mechanics](https://pubmed.ncbi.nlm.nih.gov/2026635/) informed torso lean and transfer of weight onto the feet.

| Area | Status | Visual finding and retest |
|---|---|---|
| Natural Standing and neutral arms | PASS for sampled pose | Arms sit down by the sides and elbow alignment was checked in all four views. Shoulder and wrist deformation across the full range remain open. |
| Walk | PARTIAL | Alternating support and arm counter-swing were visible. A longer continuous walk and all style presets still need independent contact and deformation checks. |
| Run support | PASS for sampled correction | The baseline visibly swept the foot along the floor. The updated clip uses world-space support targets, swing and flight, with a shorter arm swing and flexed elbows. Maximum ankle displacement across the sampled support windows dropped from about 0.418 to 0.018 Studio units. Sprinting and full-course acceleration remain unverified. |
| Jump and landing | PASS for sampled correction | Compression, takeoff, flight, landing load and recovery were visible. Sampled post-landing ankle deviation fell from 0.043 to below 0.001 Studio units. This is a procedural motion with a ballistic root arc. Force, center of mass and momentum were not measured. |
| Sit Down, Stand Up and paired transition | PASS for sampled correction | Feet remained visually planted and the torso leans toward the support base during transfer. Paired Sit Down → Stand Up now reuses the standing reference, avoiding a second crouch and a lowered end pose. The chairless preset was reviewed. Variable-height chair contact remains unverified. |
| Turn and Walk → Run | PARTIAL | A recorded BVH turn excerpt and one sequencer transition were reviewed. Standalone turn controls and other transition pairs remain open. |
| Punch, fingers and grips | PARTIAL | Straight Punch, both index curls and fist, sword, spear, staff and bow hand presets were recorded. Fist/thumb pinching and joint deformation remain visible in close-up. Live prop contact, arrow release, kick and chained fighting clips remain open. |
| Acting and face | PARTIAL | Quiet Standing, Speaking Gesture, Listening, and Restrained Anger were recorded. Speaking Gesture visibly uses body motion. Blinking, facial emotions and audio-driven lip-sync remain unverified. |
| Full anatomical and production validation | PARTIAL | Corrective muscle deformation, full-body balance under interaction, all motion variants, and real-device playback remain open. |

Run the capture after installing the Chromium and MakeHuman fixtures documented above.

```sh
KUMAR_VISUAL_DIR=/tmp/kumar-visual node tests/natural-movement.cjs
KUMAR_VISUAL_DIR=/tmp/kumar-visual node tests/natural-movement.cjs 'Run|Jump|Sit Down|Stand Up|Sit to Stand'
```

The runner writes PNG frames and sampled root/ankle positions for the selected takes. The numerical checks guard the sampled foot placement changes. The visual review provides the quality evidence.
