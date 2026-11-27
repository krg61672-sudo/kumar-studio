"""Run: blender -b -t 2 --python-exit-code 1 --python roundtrip.py -- input.glb output.glb"""
import argparse
import sys
import math
from pathlib import Path
import bpy

def main():
    p = argparse.ArgumentParser()
    p.add_argument("source", type=Path)
    p.add_argument("output", type=Path)
    a = p.parse_args(sys.argv[sys.argv.index("--")+1:])
    if not a.source.is_file() or a.source.resolve() == a.output.resolve():
        raise ValueError("Input must exist and output must be a separate file")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(a.source.resolve()))
    rigs = [o for o in bpy.context.scene.objects if o.type == "ARMATURE"]
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    if not rigs or not meshes:
        raise RuntimeError("Expected a skinned character")
    actions = list(bpy.data.actions)
    if not actions:
        raise RuntimeError("Input contains no animation; export an animated character")
    scene = bpy.context.scene
    scene.render.fps = 30
    scene.frame_start = math.floor(min(a.frame_range[0] for a in actions))
    scene.frame_end = math.ceil(max(a.frame_range[1] for a in actions))
    for frame in range(scene.frame_start, scene.frame_end + 1):
        scene.frame_set(frame)
        for rig in rigs:
            for bone in rig.pose.bones:
                if not all(math.isfinite(v) for row in bone.matrix for v in row):
                    raise RuntimeError(f"Nonfinite transform: {bone.name} at {frame}")
    a.output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(a.output.resolve()), export_format="GLB", export_animations=True)
    if not a.output.is_file():
        raise RuntimeError("Export failed")
    print(f"Roundtrip exported: {len(rigs)} rigs, {len(meshes)} meshes, {len(actions)} actions")

if __name__ == "__main__":
    main()
