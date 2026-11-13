"""One local edit per invocation. Images travel through stdin/stdout, never to an API."""
import os
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
(ROOT / '.local-ai-temp').mkdir(exist_ok=True)
os.environ['TEMP'] = os.environ['TMP'] = str(ROOT / '.local-ai-temp')
os.environ['TORCH_HOME'] = str(ROOT / '.local-ai-cache' / 'torch')
os.environ['HF_HOME'] = str(ROOT / '.local-ai-cache')
os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
os.environ.setdefault('HF_HUB_DOWNLOAD_TIMEOUT', '120')
os.environ.setdefault('HF_HUB_ETAG_TIMEOUT', '60')
import sys
import json
import base64
import io
import contextlib

def main():
    import torch
    # Windows mmap-backed torch storage can crash natively before Python can catch it.
    # Configure the supported non-mmap reader before diffusers/transformers import it.
    if os.name == 'nt':
        import functools
        import safetensors
        import safetensors.torch
        reader = functools.partial(safetensors.safe_open, backend='pread')
        safetensors.safe_open = reader
        safetensors.torch.safe_open = reader
        safetensors.torch.load_file = functools.partial(safetensors.torch.load_file, backend='pread')
    from PIL import Image, ImageOps
    from diffusers import StableDiffusionInstructPix2PixPipeline, EulerAncestralDiscreteScheduler
    setup = '--setup' in sys.argv
    with contextlib.redirect_stdout(sys.stderr):
        pipe = StableDiffusionInstructPix2PixPipeline.from_pretrained(
            'timbrooks/instruct-pix2pix', torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32,
            use_safetensors=True, local_files_only=not setup)
        if setup:
            print('Model downloaded successfully', file=sys.stderr)
            return
        pipe.scheduler = EulerAncestralDiscreteScheduler.from_config(pipe.scheduler.config)
        pipe.enable_attention_slicing('max')
        pipe.enable_vae_slicing()
        if torch.cuda.is_available():
            pipe.enable_model_cpu_offload()
        request = json.load(sys.stdin)
        raw = base64.b64decode(request['image'].split(',', 1)[1], validate=True)
        image = ImageOps.exif_transpose(Image.open(io.BytesIO(raw))).convert('RGB')
        image = ImageOps.fit(image, (384, 384))
        prompts = {
            'santa': 'Turn the person into Santa Claus wearing a red Christmas coat, a red Santa hat and a fluffy white beard. Keep the face and background.',
            'tire': 'Turn the person into a funny rubber tire mascot, with a body and arms made of stacked black car tires. Keep the human face visible.'
        }
        result = pipe(prompts[request['style']], image=image, num_inference_steps=15,
                      guidance_scale=7, image_guidance_scale=1.5)
        if result.nsfw_content_detected and any(result.nsfw_content_detected):
            raise ValueError('Mô hình không trả ảnh phù hợp. Hãy thử ảnh khác.')
        output = io.BytesIO()
        result.images[0].save(output, format='PNG')
    print(json.dumps({'image': 'data:image/png;base64,' + base64.b64encode(output.getvalue()).decode()}))

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(json.dumps({'error': str(error)}))
        sys.exit(1)
