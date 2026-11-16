#!/usr/bin/env python3
"""Compute a reproducible Laplace–Beltrami basis on a rounded cube's surface.

Six planar faces, twelve quarter cylinders, eight spherical octants. The
closed surface is the boundary of [-a,a]^3 + B_r, a=.70, r=.30 (outer width 2).
P1 triangular FEM: cotangent stiffness, lumped barycentric mass, K u = λ M u.
See web/data/modes/README.txt for the thin-metal interpretation and limitations.
"""
import argparse
import hashlib
import itertools
import json
from pathlib import Path
import struct

import numpy as np
from scipy.sparse import coo_matrix, diags
from scipy.sparse.linalg import eigsh

ROOT = Path(__file__).resolve().parents[1]
INNER = .70
RADIUS = .30
COUNT = 26


def mesh(refinement=1, inner=INNER, radius=RADIUS):
    # Parameter grid explicitly contains the face/cylinder/sphere junctions.
    # Four-way fans avoid choosing a preferred diagonal on a square face.
    outer = inner + radius
    if inner == 0:
        coords = np.linspace(-outer, outer, 20 * refinement + 1)
    else:
        coords = np.r_[np.linspace(-outer, -inner, 4 * refinement, endpoint=False),
                       np.linspace(-inner, inner, 12 * refinement, endpoint=False),
                       np.linspace(inner, outer, 4 * refinement + 1)]
    vertices, normals, faces, lookup = [], [], [], {}

    def vertex(p):
        key = tuple(np.round(p, 12))
        if key not in lookup:
            q = np.clip(p, -inner, inner)
            normal = p - q
            normal /= np.linalg.norm(normal)
            lookup[key] = len(vertices)
            vertices.append(q + radius * normal)
            normals.append(normal)
        return lookup[key]

    for axis, sign in itertools.product(range(3), [-1, 1]):
        u, v = [d for d in range(3) if d != axis]

        def point(s, t):
            p = np.zeros(3)
            p[axis], p[u], p[v] = sign * outer, s, t
            return p

        for i in range(len(coords) - 1):
            for j in range(len(coords) - 1):
                s, s1, t, t1 = coords[i], coords[i + 1], coords[j], coords[j + 1]
                corners = [vertex(point(s, t)), vertex(point(s1, t)),
                           vertex(point(s1, t1)), vertex(point(s, t1))]
                center = vertex(point((s + s1) / 2, (t + t1) / 2))
                for k in range(4):
                    face = [corners[k], corners[(k + 1) % 4], center]
                    a, b, c = [vertices[index] for index in face]
                    if np.dot(np.cross(b - a, c - a), a + b + c) < 0:
                        face.reverse()
                    faces.append(face)
    return np.array(vertices), np.array(normals), np.array(faces)


def operators(vertices, faces):
    a, b, c = (vertices[faces[:, i]] for i in range(3))
    twice_area = np.linalg.norm(np.cross(b - a, c - a), axis=1)
    assert np.all(twice_area > 1e-12)
    mass = np.zeros(len(vertices))
    for i in range(3):
        np.add.at(mass, faces[:, i], twice_area / 6)
    rows, cols, vals = [], [], []
    for i, j, k in [(0, 1, 2), (1, 2, 0), (2, 0, 1)]:
        edge1 = vertices[faces[:, j]] - vertices[faces[:, i]]
        edge2 = vertices[faces[:, k]] - vertices[faces[:, i]]
        weights = np.sum(edge1 * edge2, axis=1) / twice_area / 2
        p, q = faces[:, j], faces[:, k]
        rows.extend([p, q, p, q]); cols.extend([p, q, q, p])
        vals.extend([weights, weights, -weights, -weights])
    stiffness = coo_matrix((np.concatenate(vals),
                           (np.concatenate(rows), np.concatenate(cols))),
                          shape=(len(vertices), len(vertices))).tocsr()
    return stiffness, mass


def canonicalize(values, vectors, vertices, mass):
    # Eigenspaces at repeated eigenvalues have no distinguished orientation.
    # Project a fixed sequence of coordinate monomials, then orthogonalize.
    probes = []
    for degree in range(1, 9):
        for x in range(degree, -1, -1):
            for y in range(degree - x, -1, -1):
                z = degree - x - y
                probes.append(vertices[:, 0] ** x * vertices[:, 1] ** y * vertices[:, 2] ** z)
    first = 0
    while first < len(values):
        last = first + 1
        while last < len(values) and abs(values[last] - values[first]) < 1e-7:
            last += 1
        space = vectors[:, first:last]
        coefficients = []
        for probe in probes:
            coefficient = space.T @ (mass * probe)
            for _ in range(2):
                for existing in coefficients:
                    coefficient -= existing * np.dot(existing, coefficient)
            length = np.linalg.norm(coefficient)
            if length > 1e-7:
                coefficients.append(coefficient / length)
            if len(coefficients) == last - first:
                break
        assert len(coefficients) == last - first, 'Insufficient canonical probes'
        vectors[:, first:last] = space @ np.column_stack(coefficients)
        first = last
    return vectors


def solve(refinement, inner=INNER, radius=RADIUS, canonical=True):
    vertices, normals, faces = mesh(refinement, inner, radius)
    stiffness, mass = operators(vertices, faces)
    # A small negative shift avoids factoring the singular constant mode.
    # Solve extra modes to include complete degenerate groups before truncating.
    values, vectors = eigsh(stiffness, k=36, M=diags(mass), sigma=-.01,
                            which='LM', tol=1e-11,
                            v0=np.random.default_rng(1729).normal(size=len(vertices)))
    order = np.argsort(values)
    values, vectors = values[order], vectors[:, order]
    assert abs(values[0]) < 1e-8 and values[1] > 0
    values, vectors = values[1:], vectors[:, 1:]
    if canonical:
        # Drop the final group if the eigensolver cut through it.
        last = len(values) - 1
        while last and abs(values[last - 1] - values[-1]) < 1e-7:
            last -= 1
        values, vectors = values[:last], vectors[:, :last]
        assert len(values) >= COUNT
        vectors = canonicalize(values, vectors, vertices, mass)
    values, vectors = values[:COUNT], vectors[:, :COUNT]
    # Area-average orthonormality: mean(phi_i phi_j) = delta_ij.
    vectors *= np.sqrt(mass.sum())
    residual = stiffness @ vectors - mass[:, None] * vectors * values
    relative = np.linalg.norm(residual, axis=0) / np.linalg.norm(mass[:, None] * vectors * values, axis=0)
    orthogonal_error = np.max(np.abs(vectors.T @ (mass[:, None] * vectors) / mass.sum() - np.eye(COUNT)))
    assert np.max(relative) < 1e-7 and orthogonal_error < 1e-9
    return vertices, normals, faces, mass, values, vectors, {
        'vertices': len(vertices), 'triangles': len(faces),
        'maxRelativeResidual': float(np.max(relative)),
        'maxOrthogonalityError': float(orthogonal_error),
        'area': float(mass.sum()),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true', help='Check convergence and the unit-sphere limit.')
    args = parser.parse_args()
    v, normals, faces, mass, values, modes, diagnostics = solve(1)
    # Surface area: six squares + twelve quarter cylinders + eight octants.
    exact_area = 24 * INNER ** 2 + 12 * np.pi * INNER * RADIUS + 4 * np.pi * RADIUS ** 2
    diagnostics['analyticArea'] = float(exact_area)
    diagnostics['relativeAreaError'] = float(abs(mass.sum() / exact_area - 1))
    if args.check:
        refined = solve(2)
        error = np.abs(values / refined[4] - 1)
        diagnostics['refinement'] = {'vertices': len(refined[0]),
                                     'maxRelativeEigenvalueChange': float(np.max(error)),
                                     'eigenvalues': refined[4].tolist()}
        assert np.max(error) < .025, 'Mesh needs refinement'
        sphere = solve(1, inner=0, radius=1, canonical=False)
        exact = np.repeat([2., 6., 12., 20., 30.], [3, 5, 7, 9, 11])[:COUNT]
        sphere_error = np.max(np.abs(sphere[4] / exact - 1))
        assert sphere_error < .025, 'Sphere spectrum failed'
        diagnostics['unitSphereMaxRelativeEigenvalueError'] = float(sphere_error)
    directory = ROOT / 'web/data/modes'
    directory.mkdir(parents=True, exist_ok=True)
    payload = b'PCUBEV01' + struct.pack('<IIII', len(v), len(faces), COUNT, 0)
    for array, dtype in [(v, '<f4'), (normals, '<f4'), (faces, '<u4'),
                         (mass, '<f4'), (modes.T, '<f4')]:
        payload += np.asarray(array, dtype=dtype).tobytes(order='C')
    (directory / 'rounded-cube.bin').write_bytes(payload)
    metadata = {'version': 1, 'operator': 'negative Laplace–Beltrami',
                'geometry': {'innerHalfExtent': INNER, 'roundingRadius': RADIUS, 'outerWidth': 2},
                'modeCount': COUNT, 'eigenvalues': values.tolist(),
                'normalization': 'area-average orthonormal',
                'sha256': hashlib.sha256(payload).hexdigest(), 'diagnostics': diagnostics}
    (directory / 'rounded-cube.json').write_text(json.dumps(metadata, indent=2) + '\n')
    print(json.dumps(diagnostics, indent=2))
    print(f'Wrote {len(payload):,} bytes; first eigenvalues: {values[:8]}')


if __name__ == '__main__':
    main()
