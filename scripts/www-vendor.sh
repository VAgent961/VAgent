#!/bin/zsh
# Rebuild www/vendor (only when upgrading the libraries; the site itself has no build step).
set -e
cd "$(dirname "$0")/.." && R=$PWD; W=$(mktemp -d); cd $W
npm init -y >/dev/null && npm i --silent three@0.187.0 gsap@3.15.1 lenis@1.3.29 esbuild@0.25.12
cat > entry.js <<'JS'
export { WebGLRenderer, Scene, PerspectiveCamera, InstancedMesh, Mesh, MeshStandardMaterial, MeshBasicMaterial, ShadowMaterial, PlaneGeometry, SphereGeometry, TubeGeometry, CatmullRomCurve3, HemisphereLight, DirectionalLight, Object3D, Group, Color, Vector3, Quaternion, Euler, NeutralToneMapping, PCFShadowMap, DynamicDrawUsage } from 'three';
export { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
JS
node_modules/.bin/${ESB:-esbuild} entry.js --bundle --minify --format=esm --legal-comments=eof --outfile=$R/www/vendor/three.bundle.min.js
cp node_modules/gsap/dist/{gsap.min.js,ScrollTrigger.min.js} node_modules/lenis/dist/{lenis.min.js,lenis.css} $R/www/vendor/
cp node_modules/three/LICENSE $R/www/vendor/LICENSE-three.txt; cp node_modules/lenis/LICENSE $R/www/vendor/LICENSE-lenis.txt
sed -i '' '/sourceMappingURL/d' $R/www/vendor/*.js; rm -rf $W
