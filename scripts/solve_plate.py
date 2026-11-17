#!/usr/bin/env python3
"""Free square aluminum plate: MITC4 bending subsystem, natural free edges.
Run with .venv-shell/bin/python scripts/solve_plate.py. Uses requirements-shell.txt.
"""
import hashlib
import json
import struct
import numpy as np
from scipy.sparse.linalg import eigsh
from solve_shell import assemble, rigid_basis, plate_benchmark, E, NU, RHO, THICKNESS, ROOT

COUNT = 26
LENGTH = .2


def solve(n):
    axis = np.linspace(-LENGTH/2, LENGTH/2, n+1)
    vertices = np.array([[x,y,0.] for x in axis for y in axis])
    normals = np.tile([0.,0.,1.], (len(vertices),1))
    at = lambda i,j: i*(n+1)+j
    quads = np.array([[at(i,j),at(i+1,j),at(i+1,j+1),at(i,j+1)] for i in range(n) for j in range(n)])
    # Retain transverse displacement and both rotations; membrane motion decouples
    # exactly on a flat isotropic plate. No edge constraints or penalty springs.
    ids = (5*np.arange(len(vertices))[:,None]+[2,3,4]).ravel()
    K,M,_ = assemble(vertices,normals,quads)
    K,M = K[ids][:,ids], M[ids][:,ids]
    rigid = rigid_basis(vertices,normals)[ids][:,[2,3,4]]
    rigid_error = np.max(np.linalg.norm(K@rigid,axis=0)/(np.linalg.norm(K.data)*np.linalg.norm(rigid,axis=0)))
    values,U = eigsh(K,M=M,k=COUNT+8,sigma=-1e4,which='LM',tol=1e-10,v0=np.random.default_rng(42).normal(size=len(ids)))
    order = np.argsort(values); values,U = values[order],U[:,order]
    assert max(abs(values[:3])) < values[3]*1e-6 and values[3]>1
    values,U = values[3:],U[:,3:]
    # Give repeated eigenspaces a deterministic orientation using polynomial probes.
    xy = vertices[:,:2]/(LENGTH/2)
    probes = []
    for degree in range(10):
        for a in range(degree+1):
            probe = np.zeros((len(vertices),3)); probe[:,0] = xy[:,0]**a*xy[:,1]**(degree-a)
            probes.append(probe.ravel())
    coefficients = U.T@(M@np.array(probes).T)
    start = 0
    while start<len(values):
        end = start+1
        while end<len(values) and abs(values[end]/values[start]-1)<1e-7: end+=1
        basis=[]
        for candidate in coefficients[start:end].T:
            candidate=candidate.copy()
            for _ in range(2):
                for q in basis: candidate-=q*np.dot(q,candidate)
            if np.linalg.norm(candidate)>1e-8: basis.append(candidate/np.linalg.norm(candidate))
            if len(basis)==end-start: break
        assert len(basis)==end-start
        U[:,start:end]=U[:,start:end]@np.array(basis).T
        values[start:end]=np.mean(values[start:end]); start=end
    residual = np.max(np.linalg.norm(K@U-(M@U)*values,axis=0)/np.linalg.norm((M@U)*values,axis=0))
    orth = np.max(abs(U.T@(M@U)-np.eye(len(values))))
    assert residual<1e-5 and orth<1e-8 and rigid_error<1e-10
    # Tensor grid stored y-major for the browser; area-average w^2 = 1.
    fields=U[0::3,:COUNT].T.reshape(COUNT,n+1,n+1).transpose(0,2,1).copy()
    weights=np.ones(n+1);weights[[0,-1]]=.5
    area=weights[:,None]*weights[None,:]
    fields/=np.sqrt(np.sum(fields**2*area,axis=(1,2))/sum(area.ravel()))[:,None,None]
    diagnostics={'resolution':n,'rigidBodyCount':3,'maxRigidBodyResidual':float(rigid_error),
                 'maxRelativeEigenResidual':float(residual),'maxMassOrthogonalityError':float(orth)}
    print(n, np.sqrt(values[:COUNT])/(2*np.pi), diagnostics,flush=True)
    return values[:COUNT], fields, diagnostics


if __name__ == '__main__':
    coarse,_,_=solve(32)
    values,fields,diagnostics=solve(48)
    error=np.abs(np.sqrt(coarse/values)-1)
    assert max(error)<.025, 'Refine the mesh further'
    diagnostics['refinement']={'coarseResolution':32,'fineResolution':48,'maxRelativeFrequencyChange':float(max(error)), 'relativeFrequencyChanges':error.tolist()}
    diagnostics['simplySupportedBenchmark']=plate_benchmark(24)
    payload=b'PPLATE01'+struct.pack('<II',fields.shape[1],COUNT)+np.asarray(fields,dtype='<f4').tobytes()
    metadata={'version':1,'model':'MITC4 Reissner–Mindlin free plate','boundaryCondition':'all edges free; three transverse rigid motions excluded',
              'modeCount':COUNT,'gridSize':fields.shape[1],'material':{'youngModulusPa':E,'poissonRatio':NU,'densityKgM3':RHO},
              'geometry':{'widthM':LENGTH,'thicknessM':THICKNESS},'massKg':LENGTH**2*THICKNESS*RHO,
              'eigenvalues':values.tolist(),'frequenciesHz':(np.sqrt(values)/(2*np.pi)).tolist(),
              'normalization':'area-average transverse displacement squared = 1','diagnostics':diagnostics,
              'sha256':hashlib.sha256(payload).hexdigest()}
    (ROOT/'web/data/modes/free-plate.bin').write_bytes(payload)
    (ROOT/'web/data/modes/free-plate.json').write_text(json.dumps(metadata,indent=2)+'\n')
