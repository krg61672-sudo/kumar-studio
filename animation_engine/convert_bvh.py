"""Headless Blender animation conversion prototype. Run with Blender --background --python this file -- input.bvh output.glb."""
import argparse
import sys
from pathlib import Path
import bpy

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args(sys.argv[sys.argv.index("--")+1:])
    if not args.source.is_file() or args.source.suffix.lower() != ".bvh":
        raise ValueError("A valid BVH recording is required")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_anim.bvh(filepath=str(args.source.resolve()), axis_forward="-Z", axis_up="Y", use_fps_scale=False, update_scene_fps=True, update_scene_duration=True)
    rig = bpy.context.object
    if rig is None or rig.type != "ARMATURE":
        raise RuntimeError("BVH did not produce an armature")
    action = rig.animation_data.action if rig.animation_data else None
    if action is None:
        raise RuntimeError("No recorded action")
    start, end = action.frame_range
    scene = bpy.context.scene
    scene.frame_start, scene.frame_end = int(start), int(end)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(args.output.resolve()), export_format="GLB", export_animations=True)
    if not args.output.is_file():
        raise RuntimeError("Export failed")
    print("EXPORTED", args.output, "bones", len(rig.data.bones), "frames", start, end)

if __name__ == "__main__":
    main()
