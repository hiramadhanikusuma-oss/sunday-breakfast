import * as THREE from 'three';

const canvas = document.getElementById('hero3d');
if (canvas) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.z = 6;

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const ambient = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambient);
  const point = new THREE.PointLight(0x0533a8, 1.2, 20);
  point.position.set(3, 3, 4);
  scene.add(point);

  const geometries = [
    new THREE.SphereGeometry(0.6, 32, 32),
    new THREE.BoxGeometry(0.8, 0.8, 0.8),
    new THREE.TorusGeometry(0.5, 0.18, 16, 48),
    new THREE.OctahedronGeometry(0.6),
  ];
  const colors = [0x0533a8, 0xc9a961, 0x0533a8, 0xc9a961];
  const meshes = [];
  for (let i = 0; i < 4; i++) {
    const mat = new THREE.MeshStandardMaterial({ color: colors[i], metalness: 0.3, roughness: 0.4 });
    const m = new THREE.Mesh(geometries[i], mat);
    m.position.set((i - 1.5) * 1.6, Math.sin(i) * 0.8, 0);
    scene.add(m);
    meshes.push(m);
  }

  let mx = 0, my = 0;
  window.addEventListener('mousemove', (e) => {
    mx = (e.clientX / window.innerWidth - 0.5) * 2;
    my = (e.clientY / window.innerHeight - 0.5) * 2;
  });

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', onResize);

  const clock = new THREE.Clock();
  function animate() {
    requestAnimationFrame(animate);
    const t = clock.getElapsedTime();
    meshes.forEach((m, i) => {
      m.rotation.x = t * 0.3 + i;
      m.rotation.y = t * 0.4 + i * 0.5;
      m.position.y = Math.sin(t + i) * 0.4;
    });
    camera.position.x += (mx * 0.5 - camera.position.x) * 0.05;
    camera.position.y += (-my * 0.5 - camera.position.y) * 0.05;
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
  }
  animate();
}