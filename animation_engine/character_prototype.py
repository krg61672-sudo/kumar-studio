"""Independent procedural character geometry prototype; not a production rig."""
import bpy, math, os
from mathutils import Vector
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
def mat(name,color,rough=.5):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*color,1); p.inputs['Roughness'].default_value=rough
    return m
skin=mat('Skin',(.64,.39,.28)); hair=mat('Ink hair',(.025,.019,.03)); silk=mat('Ivory silk',(.72,.81,.85)); trim=mat('Silver blue',(.13,.27,.39)); eye=mat('Dark iris',(.04,.025,.018)); white=mat('Eye white',(.8,.78,.72))
def ell(name,loc,scale,m):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32,ring_count=20,location=loc)
    o=bpy.context.object; o.name=name; o.scale=scale; o.data.materials.append(m)
    for p in o.data.polygons:p.use_smooth=True
    return o
def limb(name,a,b,r1,r2,m):
    a,b=Vector(a),Vector(b); d=b-a
    bpy.ops.mesh.primitive_cone_add(vertices=32,radius1=r1,radius2=r2,depth=d.length,location=(a+b)/2)
    o=bpy.context.object;o.name=name;o.rotation_euler=d.to_track_quat('Z','Y').to_euler();o.data.materials.append(m)
    for p in o.data.polygons:p.use_smooth=True
    return o
ell('Head',(0,0,1.65),(.105,.087,.139),skin)
ell('Jaw',(0,-.012,1.592),(.077,.071,.077),skin)
ell('Neck',(0,0,1.49),(.048,.048,.085),skin)
ell('Hair cap',(0,.018,1.705),(.111,.092,.104),hair)
for i in range(9):
    x=(i-4)*.021
    limb('Hair lock '+str(i),(x,.067,1.72),(x*.75,.115,1.12+abs(i-4)*.025),.024,.005,hair)
for s in [-1,1]:
    ell('Eye',(s*.043,-.079,1.66),(.027,.012,.012),white)
    ell('Iris',(s*.043,-.089,1.66),(.010,.005,.010),eye)
    ell('Brow',(s*.043,-.080,1.685),(.029,.007,.004),hair)
    ell('Ear',(s*.103,0,1.64),(.017,.025,.035),skin)
ell('Nose',(0,-.086,1.628),(.017,.026,.029),skin)
ell('Mouth',(0,-.078,1.592),(.028,.007,.004),mat('Lips',(.34,.13,.11)))
ell('Torso',(0,0,1.26),(.19,.105,.25),silk)
limb('Robe skirt',(0,0,.38),(0,0,1.16),.26,.14,silk)
ell('Belt',(0,0,1.12),(.157,.112,.045),trim)
for s in [-1,1]:
    limb('Upper sleeve',(s*.16,0,1.42),(s*.24,0,1.15),.083,.069,silk)
    limb('Lower sleeve',(s*.24,0,1.15),(s*.25,0,.94),.069,.095,silk)
    ell('Hand',(s*.25,0,.90),(.035,.025,.062),skin)
    limb('Leg',(s*.08,0,.94),(s*.08,0,.12),.065,.045,trim)
    ell('Boot',(s*.08,-.035,.075),(.06,.11,.075),trim)
bpy.ops.object.camera_add(location=(3,-6,2.3))
cam=bpy.context.object;cam.rotation_euler=(Vector((0,0,.95))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=2.15
scene=bpy.context.scene;scene.camera=cam
scene.render.engine='BLENDER_WORKBENCH';scene.display.shading.light='STUDIO';scene.display.shading.color_type='MATERIAL';scene.render.resolution_x=768;scene.render.resolution_y=1024;scene.render.resolution_percentage=100
os.makedirs('test-output',exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath('test-output/dhruv-prototype.blend'))
scene.render.filepath=os.path.abspath('test-output/dhruv-prototype.png')
bpy.ops.render.render(write_still=True)
bpy.ops.export_scene.gltf(filepath=os.path.abspath('test-output/dhruv-prototype.glb'),export_format='GLB')
