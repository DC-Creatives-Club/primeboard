#!/usr/bin/env python3
"""Free aluminum rounded shell, MITC4 degenerated-shell finite elements.

Uses sdypy-model's element kernel, with globally shared analytic nodal directors
and five physical DOFs/node (3 translations + 2 tangent rotations). No drilling
penalty, artificial mass, displacement constraints, or scalar Laplacian model.
"""
import argparse
import hashlib
import importlib.util
from importlib.metadata import distribution
import itertools
import json
from pathlib import Path
import struct
import time

import numpy as np
from scipy.sparse import coo_matrix, save_npz, load_npz
from scipy.sparse.linalg import eigsh

ROOT = Path(__file__).resolve().parents[1]
E, NU, RHO, THICKNESS = 69e9, .33, 2700., .001
# User dimensions describe the outside; offset inward by half the wall thickness.
HALF, INNER, RADIUS = .1 - THICKNESS/2, .07, .03 - THICKNESS/2
COUNT = 26
# Parameterized caches cannot silently reuse matrices for a different object.
CACHE_KEY = hashlib.sha256(json.dumps([E, NU, RHO, THICKNESS, HALF, INNER, RADIUS,
                                     'sdypy-model-0.2.0/shared-directors-v1']).encode()).hexdigest()[:12]
CACHE = Path('/private/tmp/primeboard-shell') / CACHE_KEY


def kernel():
    # Load only the headless kernel: the package's public __init__ eagerly loads
    # unrelated Qt/VTK plotting tools. Pin its distribution in requirements.
    path = distribution('sdypy-model').locate_file('sdypy/model/shell/shell.py')
    spec = importlib.util.spec_from_file_location('mitc4_kernel', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def frames(normals):
    axes = np.eye(3)[np.argmin(np.abs(normals), axis=1)]
    t1 = np.cross(axes, normals)
    t1 /= np.linalg.norm(t1, axis=1)[:, None]
    return t1, np.cross(normals, t1)


def mesh(corner=4):
    coords = np.r_[np.linspace(-HALF, -INNER, corner, endpoint=False),
                   np.linspace(-INNER, INNER, 3*corner, endpoint=False),
                   np.linspace(INNER, HALF, corner+1)]
    vertices, normals, quads, lookup = [], [], [], {}
    def vertex(p):
        key = tuple(np.round(p, 12))
        if key not in lookup:
            q = np.clip(p, -INNER, INNER)
            n = p-q; n /= np.linalg.norm(n)
            lookup[key] = len(vertices); vertices.append(q+RADIUS*n); normals.append(n)
        return lookup[key]
    for axis, sign in itertools.product(range(3), [-1, 1]):
        u, v = [d for d in range(3) if d != axis]
        def point(s,t):
            p = np.zeros(3); p[axis],p[u],p[v] = sign*HALF,s,t
            return p
        for i in range(len(coords)-1):
            for j in range(len(coords)-1):
                s,s1,t,t1 = coords[i],coords[i+1],coords[j],coords[j+1]
                ids = [vertex(point(s,t)),vertex(point(s1,t)),vertex(point(s1,t1)),vertex(point(s,t1))]
                a,b,c = np.array([vertices[index] for index in ids[:3]])
                if np.dot(np.cross(b-a,c-a),a+b+c)<0: ids.reverse()
                quads.append(ids)
    return np.array(vertices),np.array(normals),np.array(quads)


def assemble(vertices, normals, quads):
    module = kernel(); t1,t2 = frames(normals)
    element = module.Shell.__new__(module.Shell)
    element.young_modulus = [E]; element.poisson_ratio = [NU]
    element.density = [RHO]; element.thickness = [THICKNESS]
    # Director interpolation is shared between adjacent elements, including
    # planar/cylindrical/spherical seams. Kernel rotations are in these frames.
    retained = np.array([6*n+d for n in range(4) for d in range(5)])
    n = len(vertices)*5; size = len(quads)*400
    rows = np.empty(size,dtype=np.int32); cols = np.empty_like(rows)
    kvals = np.empty(size); mvals = np.empty(size); volume = 0.
    for k, ids in enumerate(quads):
        module.get_normal_vector = lambda _, ids=ids: (normals[ids],t1[ids],t2[ids])
        ke,me,info = element.construct_MITC4_matrices_for_element(vertices[ids],0)
        dofs = (ids[:,None]*5 + np.arange(5)).ravel()
        sl = slice(k*400,(k+1)*400)
        rows[sl] = np.repeat(dofs,20); cols[sl] = np.tile(dofs,20)
        kvals[sl] = ke[np.ix_(retained,retained)].ravel()
        mvals[sl] = me[np.ix_(retained,retained)].ravel()
        volume += info['Volume']
        if k%1000 == 0: print(f'  assembled {k}/{len(quads)}',flush=True)
    K = coo_matrix((kvals,(rows,cols)),shape=(n,n)).tocsr()
    M = coo_matrix((mvals,(rows,cols)),shape=(n,n)).tocsr()
    K.eliminate_zeros(); M.eliminate_zeros()
    return K,M,volume


def rigid_basis(vertices,normals):
    t1,t2 = frames(normals); R = np.zeros((5*len(vertices),6))
    for j in range(3):
        R[j::5,j] = 1
        motion = np.cross(np.eye(3)[j],vertices)
        for d in range(3): R[d::5,3+j] = motion[:,d]
        R[3::5,3+j] = t1[:,j]; R[4::5,3+j] = t2[:,j]
    return R


def solve(corner):
    CACHE.mkdir(parents=True, exist_ok=True)
    v,n,q = mesh(corner); prefix = CACHE/f'shell-{corner}'
    if prefix.with_suffix('.mass.npz').exists():
        K=load_npz(prefix.with_suffix('.stiffness.npz')); M=load_npz(prefix.with_suffix('.mass.npz'))
        volume=float(prefix.with_suffix('.volume').read_text())
    else:
        K,M,volume=assemble(v,n,q)
        save_npz(prefix.with_suffix('.stiffness.npz'),K);save_npz(prefix.with_suffix('.mass.npz'),M)
        prefix.with_suffix('.volume').write_text(str(volume))
    R=rigid_basis(v,n)
    rigid_error=np.linalg.norm(K@R,axis=0)/(np.linalg.norm(K.data)*np.linalg.norm(R,axis=0))
    print('rigid residuals',rigid_error,flush=True)
    assert max(rigid_error)<1e-10, 'Rigid-body patch test failed'
    start=time.time()
    values,U=eigsh(K,M=M,k=COUNT+14,sigma=-1e6,which='LM',tol=1e-9,v0=np.random.default_rng(42).normal(size=K.shape[0]))
    order=np.argsort(values);values,U=values[order],U[:,order]
    print('raw first eigenvalues',values[:10], 'seconds',time.time()-start,flush=True)
    assert max(abs(values[:6])) < values[6]*1e-6 and values[6]>1, 'Expected exactly six rigid motions'
    values,U=values[6:],U[:,6:]
    residual=np.linalg.norm(K@U-(M@U)*values,axis=0)/np.linalg.norm((M@U)*values,axis=0)
    orth=np.max(abs(U.T@(M@U)-np.eye(len(values))))
    print('frequencies',np.sqrt(values[:COUNT])/(2*np.pi), 'residual',max(residual),flush=True)
    assert max(residual)<1e-5 and orth<1e-8
    diagnostics={'vertices':len(v),'quadrilaterals':len(q),'degreesOfFreedom':K.shape[0],
                 'massKg':RHO*volume,'rigidBodyCount':6,'maxRigidBodyResidual':float(max(rigid_error)),
                 'maxRelativeEigenResidual':float(max(residual)),'maxMassOrthogonalityError':float(orth)}
    np.savez_compressed(prefix.with_suffix('.solution.npz'),vertices=v,normals=n,quads=q,values=values,modes=U)
    return v,n,q,values,U,diagnostics


def plate_benchmark(resolution=16):
    length=.2; xy=np.linspace(0,length,resolution+1)
    v=np.array([[x,y,0] for x in xy for y in xy]); n=np.tile([0.,0.,1.],(len(v),1))
    at=lambda i,j:i*(resolution+1)+j
    q=np.array([[at(i,j),at(i+1,j),at(i+1,j+1),at(i,j+1)] for i in range(resolution) for j in range(resolution)])
    K,M,_=assemble(v,n,q)
    # Bending subsystem; simply supported transverse edges, free rotations.
    ids=[]
    for i,(x,y,_) in enumerate(v):
        if 0<x<length and 0<y<length: ids.append(5*i+2)
        ids.extend([5*i+3,5*i+4])
    vals=eigsh(K[ids][:,ids],M=M[ids][:,ids],k=4,sigma=0,which='LM',return_eigenvectors=False)
    freq=np.sqrt(np.sort(vals))/(2*np.pi)
    D=E*THICKNESS**3/(12*(1-NU**2))
    exact=np.array([2,5,5,8])*np.pi/(2*length**2)*np.sqrt(D/(RHO*THICKNESS))
    error=max(abs(freq/exact-1));print('plate benchmark',freq,exact,error,flush=True)
    assert error<.025
    return {'resolution':resolution,'computedHz':freq.tolist(),'analyticalKirchhoffLoveHz':exact.tolist(),'maxRelativeFrequencyError':float(error)}


def canonicalize(values, U, vertices, normals, M):
    """Fix arbitrary rotations inside repeated eigenspaces using geometric probes."""
    x=vertices/HALF
    probes=[]
    for degree in range(6):
        for a in range(degree+1):
            for b in range(degree-a+1):
                c=degree-a-b; scalar=x[:,0]**a*x[:,1]**b*x[:,2]**c
                for direction in [normals, *[np.tile(axis,(len(x),1)) for axis in np.eye(3)]]:
                    probe=np.zeros((len(x),5));probe[:,:3]=scalar[:,None]*direction
                    probes.append(probe.ravel())
    coefficients=U.T@(M@np.array(probes).T)
    result=U.copy(); start=0
    while start<len(values):
        end=start+1
        while end<len(values) and abs(values[end]/values[start]-1)<1e-6:end+=1
        basis=[]
        for candidate in coefficients[start:end].T:
            candidate=candidate.copy()
            for _ in range(2):
                for q in basis:candidate-=q*np.dot(q,candidate)
            if np.linalg.norm(candidate)>1e-8:
                basis.append(candidate/np.linalg.norm(candidate))
            if len(basis)==end-start:break
        assert len(basis)==end-start
        result[:,start:end]=U[:,start:end]@np.array(basis).T
        values[start:end]=np.mean(values[start:end]);start=end
    return result


def export(result, refined, benchmark):
    v,n,quads,values,U,diagnostics=result
    fine_values=refined[3]
    error=np.abs(np.sqrt(values[:COUNT]/fine_values[:COUNT])-1)
    assert max(error)<.03, 'First 26 frequencies need further mesh refinement'
    M=load_npz(CACHE/f"shell-{int(round(np.sqrt(len(quads)/150)))}.mass.npz")
    U=canonicalize(values,U,v,n,M)
    K=load_npz(CACHE/f"shell-{int(round(np.sqrt(len(quads)/150)))}.stiffness.npz")
    residual=np.linalg.norm(K@U-(M@U)*values,axis=0)/np.linalg.norm((M@U)*values,axis=0)
    orth=float(np.max(abs(U.T@(M@U)-np.eye(len(values)))))
    assert max(residual)<1e-5 and orth<1e-8
    diagnostics['maxRelativeEigenResidual']=float(max(residual))
    diagnostics['maxMassOrthogonalityError']=orth
    vectors=U.reshape(len(v),5,-1)[:,:3,:COUNT].transpose(2,0,1).copy()
    # Triangulation is only for rendering; the solve uses quadrilateral shells.
    faces=np.array([[a,b,c] for a,b,c,d in quads]+[[a,c,d] for a,b,c,d in quads])
    positions=v/HALF
    area=np.zeros(len(v))
    for face in faces:
        a,b,c=positions[face];area[face]+=np.linalg.norm(np.cross(b-a,c-a))/6
    rms=np.sqrt(np.sum(vectors**2*area[None,:,None],axis=(1,2))/sum(area))
    vectors/=rms[:,None,None]
    normal=np.einsum('mni,ni->mn',vectors,n)
    frequency=np.sqrt(values[:COUNT])/(2*np.pi)
    diagnostics['refinement']={'vertices':len(refined[0]),'quadrilaterals':len(refined[2]),
        'frequenciesHz':(np.sqrt(fine_values[:COUNT])/(2*np.pi)).tolist(),
        'maxRelativeFrequencyChange':float(max(error)),'relativeFrequencyChanges':error.tolist()}
    diagnostics['simplySupportedPlate']=benchmark
    diagnostics['normalDisplacementRMS']=np.sqrt((normal**2@area)/sum(area)).tolist()
    payload=b'PSHELL01'+struct.pack('<IIII',len(v),len(faces),COUNT,0)
    for array,dtype in [(positions,'<f4'),(n,'<f4'),(faces,'<u4'),(area,'<f4'),(normal,'<f4'),(vectors,'<f4')]:
        payload+=np.asarray(array,dtype=dtype).tobytes(order='C')
    directory=ROOT/'web/data/modes'
    metadata={'version':1,'model':'MITC4 elastic shell','operator':'linear elastic shell stiffness and consistent mass',
        'boundaryCondition':'free-free, six rigid-body motions excluded',
        'material':{'name':'aluminum (ideal isotropic)','youngModulusPa':E,'poissonRatio':NU,'densityKgM3':RHO},
        'geometry':{'outerWidthM':2*HALF+THICKNESS,'outerCornerRadiusM':RADIUS+THICKNESS/2,'midSurfaceWidthM':2*HALF,'midSurfaceCornerRadiusM':RADIUS,'thicknessM':THICKNESS,
                    'displayScaleM':HALF,'innerHalfExtent':INNER/HALF,'roundingRadius':RADIUS/HALF,'outerWidth':2},
        'modeCount':COUNT,'eigenvalues':values[:COUNT].tolist(),'eigenvalueUnits':'s^-2 (omega squared)',
        'frequenciesHz':frequency.tolist(),'normalization':'area-average vector displacement squared = 1; normal field is vector dot surface normal',
        'sha256':hashlib.sha256(payload).hexdigest(),'diagnostics':diagnostics}
    (directory/'rounded-shell.bin').write_bytes(payload)
    (directory/'rounded-shell.json').write_text(json.dumps(metadata,indent=2)+'\n')
    print('Exported',len(payload),'bytes',flush=True)


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--corner',type=int,default=4)
    parser.add_argument('--benchmark',action='store_true');parser.add_argument('--refine',type=int)
    args=parser.parse_args()
    benchmark=plate_benchmark() if args.benchmark or args.refine else None
    result=solve(args.corner)
    print(json.dumps(result[-1],indent=2))
    if args.refine:
        refined=solve(args.refine)
        export(result,refined,benchmark)

if __name__=='__main__':main()
