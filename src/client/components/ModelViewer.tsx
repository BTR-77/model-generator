import { Box, Download, RotateCcw, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/client/components/ui/button";
import { Spinner } from "@/client/components/ui/spinner";
import { Toggle } from "@/client/components/ui/toggle";

type ViewerState = "loading" | "ready" | "error";

interface Scene {
  reset: () => void;
  setAutoRotate: (on: boolean) => void;
  setWireframe: (on: boolean) => void;
  exportObj: () => Promise<Blob>;
  exportStl: () => Promise<Blob>;
  dispose: () => void;
}

/**
 * An orbitable view of a GLB (drag to orbit, scroll to zoom, right-drag to
 * pan), with the model's downloads. three.js loads in the browser only.
 */
export function ModelViewer({
  src,
  downloadHref,
  fileName,
}: {
  src: string;
  downloadHref: string;
  fileName: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<Scene | null>(null);
  const [state, setState] = useState<ViewerState>("loading");
  const [autoRotate, setAutoRotate] = useState(false);
  const [wireframe, setWireframe] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    mountScene(host.current!, src)
      .then((mounted) => {
        if (cancelled) return mounted.dispose();
        scene.current = mounted;
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
      scene.current?.dispose();
      scene.current = null;
    };
  }, [src]);

  async function save(kind: "obj" | "stl") {
    if (!scene.current) return;
    const blob =
      kind === "obj"
        ? await scene.current.exportObj()
        : await scene.current.exportStl();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${fileName}.${kind}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="space-y-3">
      <div
        ref={host}
        data-testid="viewer"
        data-state={state}
        className="relative aspect-square w-full overflow-hidden rounded-xl border border-border bg-muted sm:aspect-[4/3]"
      >
        {state === "loading" ? (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            <Spinner className="size-6" />
          </div>
        ) : null}
        {state === "error" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
            <Box className="size-6" aria-hidden />
            This model couldn't be shown here. You can still download it.
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            data-testid="reset-view"
            disabled={state !== "ready"}
            onClick={() => scene.current?.reset()}
          >
            <RotateCcw aria-hidden /> Reset view
          </Button>
          <Toggle
            variant="outline"
            size="sm"
            data-testid="auto-rotate"
            disabled={state !== "ready"}
            pressed={autoRotate}
            onPressedChange={(on) => {
              setAutoRotate(on);
              scene.current?.setAutoRotate(on);
            }}
          >
            <RefreshCw aria-hidden /> Auto-rotate
          </Toggle>
          <Toggle
            variant="outline"
            size="sm"
            data-testid="wireframe"
            disabled={state !== "ready"}
            pressed={wireframe}
            onPressedChange={(on) => {
              setWireframe(on);
              scene.current?.setWireframe(on);
            }}
          >
            <Box aria-hidden /> Wireframe
          </Toggle>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            data-testid="download-glb"
            render={<a href={downloadHref} download />}
            nativeButton={false}
          >
            <Download aria-hidden /> GLB
          </Button>
          <Button
            variant="outline"
            size="sm"
            data-testid="download-obj"
            disabled={state !== "ready"}
            onClick={() => void save("obj")}
          >
            <Download aria-hidden /> OBJ
          </Button>
          <Button
            variant="outline"
            size="sm"
            data-testid="download-stl"
            disabled={state !== "ready"}
            onClick={() => void save("stl")}
          >
            <Download aria-hidden /> STL
          </Button>
        </div>
      </div>
    </div>
  );
}

async function mountScene(container: HTMLDivElement, src: string): Promise<Scene> {
  const [THREE, { GLTFLoader }, { OrbitControls }] = await Promise.all([
    import("three"),
    import("three/examples/jsm/loaders/GLTFLoader.js"),
    import("three/examples/jsm/controls/OrbitControls.js"),
  ]);
  const gltf = await new GLTFLoader().loadAsync(src);
  const model = gltf.scene;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.className = "absolute inset-0 size-full touch-none";
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 2.2));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(3, 5, 4);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.8);
  fill.position.set(-4, 2, -3);
  scene.add(fill);

  // Centre the model and fit it to a unit size.
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3()).length() || 1;
  const center = box.getCenter(new THREE.Vector3());
  model.position.sub(center);
  const holder = new THREE.Group();
  holder.add(model);
  holder.scale.setScalar(2 / size);
  scene.add(holder);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100);
  const home = new THREE.Vector3(1.6, 1.1, 2.2);
  camera.position.copy(home);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.autoRotateSpeed = 2;

  const resize = () => {
    const { clientWidth: w, clientHeight: h } = container;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
  };
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(container);

  let frame = 0;
  const loop = () => {
    frame = requestAnimationFrame(loop);
    controls.update();
    renderer.render(scene, camera);
  };
  loop();

  const materials = () => {
    const found: { wireframe: boolean }[] = [];
    model.traverse((node) => {
      const mesh = node as { isMesh?: boolean; material?: unknown };
      if (!mesh.isMesh) return;
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of list) if (material) found.push(material as { wireframe: boolean });
    });
    return found;
  };

  return {
    reset() {
      camera.position.copy(home);
      controls.target.set(0, 0, 0);
      controls.update();
    },
    setAutoRotate(on) {
      controls.autoRotate = on;
    },
    setWireframe(on) {
      for (const material of materials()) material.wireframe = on;
    },
    async exportObj() {
      const { OBJExporter } = await import("three/examples/jsm/exporters/OBJExporter.js");
      return new Blob([new OBJExporter().parse(model)], { type: "text/plain" });
    },
    async exportStl() {
      const { STLExporter } = await import("three/examples/jsm/exporters/STLExporter.js");
      const data = new STLExporter().parse(model, { binary: true });
      return new Blob([data as DataView<ArrayBuffer>], { type: "model/stl" });
    },
    dispose() {
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
