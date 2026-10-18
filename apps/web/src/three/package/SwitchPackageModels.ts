import { Group, LatheGeometry, MeshStandardMaterial, Vector2, Vector3, type BufferGeometry } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { MM_TO_WORLD as mm, type PartDefinition } from '../../data/partCatalog'
import type { CircuitModule } from '../../types/circuit'
import { createPackageMarking } from './PackageMarking'
import { packageBuilderTools } from './PackageBuilderTools'
import { contactPanelGeometry, recessedPackageBox } from './ContactPackageGeometry'

function joinedSolids(parts:BufferGeometry[]) {
  const surfaces=parts.map(part=>{if(part.index){const surface=part.toNonIndexed();part.dispose();part=surface}part.deleteAttribute('uv');return part})
  const geometry=mergeGeometries(surfaces,false);surfaces.forEach(surface=>surface.dispose())
  if(!geometry)throw Error('Contact sheet sections must share position and normal attributes.')
  return geometry
}
function contactLathe(points:Vector2[]) {
  const source=new LatheGeometry(points,48),geometry=source.toNonIndexed();source.dispose()
  const p=geometry.getAttribute('position'),n=geometry.getAttribute('normal')
  for(let i=0;i<p.count;i+=3)if(Math.abs(p.getY(i)-p.getY(i+1))<1e-9&&Math.abs(p.getY(i)-p.getY(i+2))<1e-9){
    const a=new Vector3().fromBufferAttribute(p,i),b=new Vector3().fromBufferAttribute(p,i+1),c=new Vector3().fromBufferAttribute(p,i+2),face=b.sub(a).cross(c.sub(a)),sign=Math.sign(face.y)||Math.sign(n.getY(i)+n.getY(i+1)+n.getY(i+2))||-1
    for(let j=0;j<3;j++)n.setXYZ(i+j,0,sign,0)
  }
  return geometry
}
function domedRivet(radius:number,height:number,stem=0) {
  const points=[new Vector2(0,0),new Vector2(radius*.45,0),new Vector2(radius*.45,stem),new Vector2(radius,stem)]
  for(let i=1;i<=16;i++){const angle=i*Math.PI/32;points.push(new Vector2(radius*Math.cos(angle),stem+height*Math.sin(angle)))}
  return contactLathe(points)
}
function tactileButton(radius:number,height:number) {
  const corner=.12*mm,barrel=radius*.94,points=[new Vector2(0,0),new Vector2(radius*.92,0),new Vector2(radius,.07*mm),new Vector2(radius,.16*mm),new Vector2(barrel,.22*mm),new Vector2(barrel,height-corner)]
  for(let i=1;i<=8;i++){const angle=i*Math.PI/16;points.push(new Vector2(barrel-corner+corner*Math.cos(angle),height-corner+corner*Math.sin(angle)))}
  points.push(new Vector2(0,height));return contactLathe(points)
}

/** New versioned contact packages share this builder in viewport, thumbnail and
 * preview. Historical descriptors retain the earlier factory branch. */
export function addSwitchPackageModel(group: Group, module: CircuitModule, part: PartDefinition): boolean {
  const pkg = part.package, shape = pkg.shape
  if (!shape || !['tactile', 'slide-switch', 'dip-switch'].includes(shape.family)) return false
  const { mesh, box } = packageBuilderTools(group), bottom = pkg.standoffMm * mm
  const w = pkg.bodyMm.x * mm, d = pkg.bodyMm.z * mm, caseH = shape.caseHeightMm! * mm
  const polymer = (color: string, roughness = .52) => new MeshStandardMaterial({ color, roughness, metalness: 0 })
  const black = polymer('#202326'), silver = new MeshStandardMaterial({ color: '#ADB4BA', metalness: .88, roughness: .34 })
  const bevel = (shape.bevelMm ?? .1) * mm
  const control = (property: string) => (module.properties?.[property] ?? part.editor.defaults[property]) === true
  const actuator = (object: ReturnType<typeof mesh>, property: string) => {
    object.userData.switchActuator = true; object.userData.contactControl = property
    return object
  }
  const marking = (text: string, width: number, depth: number, x: number, z: number, name: string) => {
    const label = createPackageMarking(text, width, depth, name),texture=label.material.map,canvas=texture?.image as HTMLCanvasElement|undefined,context=canvas?.getContext('2d')
    // Single-character switch legends fill their physical marking area. The
    // generic IC-marking font leaves these short legends almost invisible.
    if(context&&texture&&canvas){
      canvas.width=Math.min(1024,Math.max(128,Math.round(256*width/depth)));canvas.height=256
      context.clearRect(0,0,canvas.width,canvas.height);context.font='bold 256px Arial, sans-serif'
      const measured=context.measureText(text),height=(measured.actualBoundingBoxAscent||185)+(measured.actualBoundingBoxDescent||0)
      const font=256*Math.min(canvas.width*.90/Math.max(1,measured.width),canvas.height*.88/height)
      context.font=`bold ${font}px Arial, sans-serif`;context.textAlign='center';context.textBaseline='alphabetic';context.fillStyle='#F2F2EB'
      const fitted=context.measureText(text),ascent=fitted.actualBoundingBoxAscent||font*.72,descent=fitted.actualBoundingBoxDescent||0
      context.fillText(text,canvas.width/2,(canvas.height+ascent-descent)/2);texture.needsUpdate=true
    }
    label.position.set(x, bottom + caseH + .006 * mm, z); group.add(label); return label
  }
  if (shape.family === 'tactile') {
    const rivetH=.14*mm,coverH=shape.coverThicknessMm!*mm,baseH=caseH-.25*mm,positions=[[-1,-1],[-1,1],[1,-1],[1,1]],bodyPieces=[recessedPackageBox(w,baseH,d,bevel)]
    // Molded retention posts continue through the thin cap and into the black
    // domed heads. All of this remains inside the 3.4 mm case envelope.
    for(const [x,z] of positions)bodyPieces.push(domedRivet(.18*mm,rivetH,.12*mm).translate(x!*2.36*mm,caseH-rivetH-.12*mm,z!*2.36*mm))
    const body = mesh('package-body', joinedSolids(bodyPieces), polymer('#25282B',.56)); body.position.y = bottom
    const cover=mesh('package-switch-cover',contactPanelGeometry(w-.15*mm,d-.15*mm,coverH,.38*mm,[{x:0,y:0,width:0,height:0,radius:1.86*mm}]),silver)
    cover.rotation.x=-Math.PI/2;cover.position.y=bottom+caseH-rivetH-coverH
    for (const [i, [x, z]] of [[-1, -1], [-1, 1], [1, -1], [1, 1]].entries()) {
      const rivet=mesh(`package-switch-rivet-${i}`,domedRivet(shape.rivetDiameterMm!*mm/2,rivetH),black,false);rivet.position.set(x!*2.36*mm,bottom+caseH-rivetH,z!*2.36*mm)
    }
    const seat=mesh('package-switch-button-seat',contactLathe([[1.61,0],[1.88,0],[1.91,.07],[1.86,.14],[1.62,.14],[1.61,0]].map(([r,y])=>new Vector2(r!*mm,y!*mm))),black,false);seat.position.y=bottom+caseH-.27*mm
    const press = control('pressed') ? shape.buttonTravelMm! * mm : 0
    const buttonH = (pkg.bodyMm.y - shape.caseHeightMm! + .15) * mm
    const button = mesh('package-switch-actuator', tactileButton(shape.buttonDiameterMm!*mm/2,buttonH),black)
    button.position.y = bottom + caseH - .15 * mm - press; actuator(button, 'pressed')
    group.userData.contactPackage = 'tactile'
  } else if (shape.family === 'slide-switch') {
    const baseH = shape.baseThicknessMm! * mm, sheet = shape.sheetThicknessMm! * mm
    const base = mesh('package-switch-insulating-base', recessedPackageBox(w - .06 * mm, baseH, d - .06 * mm, bevel), black); base.position.y = bottom
    const wrapH=caseH-baseH,top=contactPanelGeometry(w,d,sheet,.18*mm,[{x:0,y:0,width:shape.slotLengthMm!*mm,height:shape.slotWidthMm!*mm}]);top.rotateX(-Math.PI/2);top.translate(0,wrapH-sheet,0)
    const sheets=[top,contactPanelGeometry(w-1*mm,d-1*mm,sheet,.15*mm).rotateX(-Math.PI/2)]
    for(const sign of [-1,1]){const h=wrapH-.08*mm,side=contactPanelGeometry(w,h,sheet,.14*mm,[{x:-3.75*mm,y:(1.35*mm-h/2),width:2.05*mm,height:1.1*mm},{x:3.75*mm,y:(1.35*mm-h/2),width:2.05*mm,height:1.1*mm}],{width:1.35*mm,height:2.05*mm});side.translate(0,h/2,sign>0?d/2-sheet:-d/2);sheets.push(side)}
    const body=mesh('package-body',joinedSolids(sheets),silver);body.position.y=bottom+baseH
    const core=mesh('package-switch-inner-case',recessedPackageBox(w-.10*mm,wrapH-sheet-.04*mm,d-2*sheet-.04*mm,.12*mm,[{x:0,z:0,width:(shape.slotLengthMm!+.4)*mm,depth:(shape.slotWidthMm!+.4)*mm,floor:.3*mm}]),black);core.position.y=bottom+baseH
    const knobH=shape.knobHeightMm!*mm+.15*mm,knobW=shape.knobLengthMm!*mm,knobD=shape.knobWidthMm!*mm,knobParts=[recessedPackageBox(knobW,knobH-.12*mm,knobD,bevel)]
    for(let i=0;i<5;i++)knobParts.push(recessedPackageBox(.24*mm,.15*mm,knobD-.10*mm,.035*mm).translate((i-2)*.55*mm,knobH-.15*mm,0))
    const knob=mesh('package-switch-actuator',joinedSolids(knobParts),black)
    knob.position.set((control('state') ? -1 : 1) * shape.travelMm! * mm / 2, bottom + caseH - .15 * mm, 0); actuator(knob, 'state')
    group.userData.contactPackage = 'slide-switch'
  } else {
    black.dispose(); silver.dispose()
    const red = polymer('#983A38',.48), dark = polymer('#472528',.56), white = polymer('#F2F2E9', .5),trackMaterial=new MeshStandardMaterial({color:'#AEB3B4',roughness:.56,metalness:.15})
    const slots = Array.from({ length: 4 }, (_, i) => ({ x: (i - 1.5) * 2.54 * mm, z: 0, width: shape.slotWidthMm! * mm, depth: shape.slotLengthMm! * mm, floor: caseH - shape.recessDepthMm! * mm }))
    const body = mesh('package-body', recessedPackageBox(w, caseH, d, bevel, slots), red); body.position.y = bottom
    for (const [i, slot] of slots.entries()) {
      const floor = box(`package-switch-slot-${i}`, slot.width - .01 * mm, .006 * mm, slot.depth - .01 * mm, slot.x, bottom + slot.floor + .003 * mm, 0, dark, false); floor.userData.ignorePick = true
      const totalTop=pkg.bodyMm.y*mm,sliderH=.65*mm,z=(control(`position${i}`)?-1:1)*shape.travelMm!*mm/2
      const track=box(`package-switch-track-${i}`,.95*mm,.045*mm,slot.depth-.24*mm,slot.x,bottom+slot.floor+.04*mm,0,trackMaterial,false);track.userData.ignorePick=true
      const stem=mesh(`package-switch-stem-${i}`,recessedPackageBox(1.02*mm,totalTop-sliderH-slot.floor+.1*mm,1.12*mm,.04*mm),trackMaterial);stem.position.set(slot.x,bottom+slot.floor-.05*mm,z);stem.userData.contactControl=`position${i}`
      const slider = mesh(`package-switch-actuator-${i}`, recessedPackageBox(shape.actuatorWidthMm! * mm, sliderH, shape.actuatorLengthMm! * mm, .08 * mm), white)
      slider.position.set(slot.x,bottom+totalTop-sliderH,z); actuator(slider, `position${i}`)
      marking(String(i + 1), 1.45 * mm, 1.15 * mm, slot.x, 2.57 * mm, `package-switch-number-${i}`)
    }
    marking('ON', 2.8 * mm, 1.0 * mm, -3.7 * mm, -2.61 * mm, 'package-switch-on-marking')
    group.userData.contactPackage = 'dip-switch'
  }
  return true
}
