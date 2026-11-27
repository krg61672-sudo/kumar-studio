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
