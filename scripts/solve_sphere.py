#!/usr/bin/env python3
"""Sphere: exact scalar harmonics and validated MITC4 aluminum shell modes.
Reproduce with .venv-shell/bin/python scripts/solve_sphere.py.
"""
import hashlib
import itertools
import json
import struct
import numpy as np
from scipy.special import sph_harm_y
from scipy.sparse.linalg import eigsh
from solve_shell import assemble, rigid_basis, canonicalize, E, NU, RHO, THICKNESS, ROOT

RADIUS=.1-THICKNESS/2
COUNT=26
OUT=ROOT/'web/data/modes'


def mesh(resolution):
    axis=np.linspace(-1,1,resolution+1)
    vertices=[];lookup={};quads=[]
    def vertex(p):
        key=tuple(np.round(p,12))
        if key not in lookup:
            lookup[key]=len(vertices);vertices.append(p/np.linalg.norm(p))
        return lookup[key]
    for dim,sign in itertools.product(range(3),[-1,1]):
        u,v=[d for d in range(3) if d!=dim]
        def point(x,y):
            p=np.zeros(3);p[dim]=sign;p[u]=x;p[v]=y;return p
        for i in range(resolution):
            for j in range(resolution):
                ids=[vertex(point(axis[i],axis[j])),vertex(point(axis[i+1],axis[j])),vertex(point(axis[i+1],axis[j+1])),vertex(point(axis[i],axis[j+1]))]
                a,b,c=np.array([vertices[k] for k in ids[:3]])
                if np.dot(np.cross(b-a,c-a),a+b+c)<0:ids.reverse()
                quads.append(ids)
    normals=np.array(vertices)
    return normals*RADIUS,normals,np.array(quads)


def render_mesh(v,quads):
    positions=v/RADIUS
    faces=np.array([[a,b,c] for a,b,c,d in quads]+[[a,c,d] for a,b,c,d in quads])
    area=np.zeros(len(v))
    for face in faces:
        a,b,c=positions[face];area[face]+=np.linalg.norm(np.cross(b-a,c-a))/6
    return positions,faces,area


def write(name,v,n,q,values,fields,metadata,vectors=None):
    positions,faces,area=render_mesh(v,q)
    payload=(b'PSHELL01' if vectors is not None else b'PCUBEV01')+struct.pack('<IIII',len(v),len(faces),COUNT,0)
    arrays=[(positions,'<f4'),(n,'<f4'),(faces,'<u4'),(area,'<f4'),(fields,'<f4')]
    if vectors is not None:arrays.append((vectors,'<f4'))
    for array,dtype in arrays:payload+=np.asarray(array,dtype=dtype).tobytes()
    metadata.update(version=1,modeCount=COUNT,eigenvalues=values.tolist(),sha256=hashlib.sha256(payload).hexdigest())
    (OUT/f'{name}.bin').write_bytes(payload)
    (OUT/f'{name}.json').write_text(json.dumps(metadata,indent=2)+'\n')


def scalar():
    v,n,q=mesh(28)
    theta=np.arccos(np.clip(n[:,2],-1,1));phi=np.arctan2(n[:,1],n[:,0])
    fields=[];labels=[];values=[];degrees=[]
    for l in range(1,6):
        for m in [0,*[k for j in range(1,l+1) for k in [j,-j]]]:
            harmonic=sph_harm_y(l,abs(m),theta,phi)
            field=harmonic.real if m==0 else np.sqrt(2)*(harmonic.real if m>0 else harmonic.imag)
            fields.append(field*np.sqrt(4*np.pi));values.append(l*(l+1));degrees.append([l,m])
            labels.append(f'({l},{m})')
    fields=np.array(fields[:COUNT]);values=np.array(values[:COUNT],dtype=float)
    _,_,area=render_mesh(v,q)
    gram=(fields*area)@fields.T/sum(area)
    error=float(np.max(abs(gram-np.eye(COUNT))))
    assert error<.01
    write('sphere-scalar',v,n,q,values,fields,{'model':'real spherical harmonics','operator':'negative Laplace–Beltrami on unit sphere',
        'geometry':{'displayRadius':1},'labels':labels[:COUNT],'harmonicIndices':degrees[:COUNT],
        'eigenvalueUnits':'normalized inverse length squared','normalization':'unit-sphere area-average scalar squared = 1 (analytical)',
        'diagnostics':{'maxDiscreteOrthogonalityError':error}})


def analytical(l):
    # Huang & Chen (1971), vacuum bending theory, Eq. 37b, xi=12(R/h)^2.
    # Omega^4 - B Omega^2 + C=0; use stable lower-root evaluation.
    L=l*(l+1);b=THICKNESS**2/(12*RADIUS**2)
    B=L+1+3*NU+b*(L*L+L*NU-1+NU)
    C=(L-2)*(1-NU**2)+b*(L**3-4*L**2+L*(5-NU**2)-2*(1-NU**2))
    root=2*C/(B+np.sqrt(B*B-4*C))
    return np.sqrt(root*E/(RHO*(1-NU**2)*RADIUS**2))/(2*np.pi)


def solve(resolution):
    v,n,q=mesh(resolution)
    K,M,volume=assemble(v,n,q)
    R=rigid_basis(v,n)
    rigid_error=float(np.max(np.linalg.norm(K@R,axis=0)/(np.linalg.norm(K.data)*np.linalg.norm(R,axis=0))))
    assert rigid_error<1e-10
    values,U=eigsh(K,M=M,k=44,sigma=-1e6,which='LM',tol=1e-9,v0=np.random.default_rng(42).normal(size=K.shape[0]))
    order=np.argsort(values);values,U=values[order],U[:,order]
    assert max(abs(values[:6]))<values[6]*1e-6 and values[6]>1
    values,U=values[6:],U[:,6:]
    U=canonicalize(values,U,v,n,M)
    residual=float(np.max(np.linalg.norm(K@U-(M@U)*values,axis=0)/np.linalg.norm((M@U)*values,axis=0)))
    orth=float(np.max(abs(U.T@(M@U)-np.eye(len(values)))))
    assert residual<1e-5 and orth<1e-8
    vectors=U.reshape(len(v),5,-1)[:,:3,:COUNT].transpose(2,0,1).copy()
    _,_,area=render_mesh(v,q)
    vectors/=np.sqrt(np.sum(vectors**2*area[None,:,None],axis=(1,2))/sum(area))[:,None,None]
    fields=np.einsum('mni,ni->mn',vectors,n)
    participation=np.sqrt(fields**2@area/sum(area))
    # Our 26 lowest modes should all be spheroidal, with visible normal motion.
    assert min(participation)>.1, 'Tangential mode encountered: explicit family filtering required'
    freq=np.sqrt(values[:COUNT])/(2*np.pi)
    reference=np.repeat([analytical(l) for l in range(2,6)],[5,7,9,11])[:COUNT]
    error=float(np.max(abs(freq/reference-1)))
    diagnostics={'resolution':resolution,'vertices':len(v),'quadrilaterals':len(q),'massKg':RHO*volume,
        'rigidBodyCount':6,'maxRigidBodyResidual':rigid_error,'maxRelativeEigenResidual':residual,
        'maxMassOrthogonalityError':orth,'normalDisplacementRMS':participation.tolist(),
        'analyticalLowerBranchHz':reference.tolist(),'maxRelativeAnalyticalFrequencyError':error}
    print('resolution',resolution,'frequencies',freq,'analytical error',error,flush=True)
    return v,n,q,values[:COUNT],fields,vectors,diagnostics


if __name__=='__main__':
    scalar()
    coarse=solve(18)
    fine=solve(26)
    error=float(max(abs(np.sqrt(coarse[3]/fine[3])-1)))
    assert error<.03 and fine[-1]['maxRelativeAnalyticalFrequencyError']<.03
    diagnostics=fine[-1]
    diagnostics['refinement']={'coarseResolution':18,'fineResolution':26,'maxRelativeFrequencyChange':error}
    v,n,q,values,fields,vectors,_=fine
    write('sphere-shell',v,n,q,values,fields,{'model':'MITC4 elastic spherical shell',
        'boundaryCondition':'freely suspended closed shell; six rigid motions excluded',
        'material':{'youngModulusPa':E,'poissonRatio':NU,'densityKgM3':RHO},
        'geometry':{'outerDiameterM':.2,'midSurfaceRadiusM':RADIUS,'thicknessM':THICKNESS},
        'frequenciesHz':(np.sqrt(values)/(2*np.pi)).tolist(),'eigenvalueUnits':'s^-2 (omega squared)',
        'normalization':'area-average vector displacement squared = 1; fields are normal projections',
        'selection':'first 26 elastic modes; all have substantial normal displacement; final degenerate family is partial',
        'diagnostics':diagnostics,'reference':'https://repository.library.noaa.gov/view/noaa/34603/noaa_34603_DS1.pdf, Eq. 37b'},vectors)
