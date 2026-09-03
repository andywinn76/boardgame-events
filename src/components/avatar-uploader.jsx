'use client';

import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const AVATAR_SIZE = 512;
const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function drawCrop(canvas, image, zoom, offsetX, offsetY) {
  const context = canvas.getContext('2d');
  if (!context) return;

  const baseScale = Math.max(AVATAR_SIZE / image.naturalWidth, AVATAR_SIZE / image.naturalHeight);
  const scale = baseScale * zoom;
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  const horizontalTravel = Math.max(0, (width - AVATAR_SIZE) / 2);
  const verticalTravel = Math.max(0, (height - AVATAR_SIZE) / 2);
  const x = (AVATAR_SIZE - width) / 2 + (offsetX / 100) * horizontalTravel;
  const y = (AVATAR_SIZE - height) / 2 + (offsetY / 100) * verticalTravel;

  context.clearRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
  context.drawImage(image, x, y, width, height);
}

function canvasBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not prepare that image.'))),
      'image/webp',
      0.9,
    );
  });
}

export function AvatarUploader({ userId, initialAvatarUrl }) {
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const sourceUrlRef = useRef(null);
  const dragRef = useRef(null);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl || '');
  const [sourceImage, setSourceImage] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (sourceImage && canvasRef.current) {
      drawCrop(canvasRef.current, sourceImage, zoom, offsetX, offsetY);
    }
  }, [sourceImage, zoom, offsetX, offsetY]);

  useEffect(() => () => {
    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
  }, []);

  function resetEditor() {
    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
    sourceUrlRef.current = null;
    setSourceImage(null);
    setZoom(1);
    setOffsetX(0);
    setOffsetY(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function loadFile(file) {
    setMessage('');
    setError('');
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError('Choose a JPEG, PNG, or WebP image.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    if (file.size > MAX_SOURCE_BYTES) {
      setError('Choose an image smaller than 10 MB.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
    const objectUrl = URL.createObjectURL(file);
    sourceUrlRef.current = objectUrl;
    const image = new Image();
    image.onload = () => {
      setZoom(1);
      setOffsetX(0);
      setOffsetY(0);
      setSourceImage(image);
    };
    image.onerror = () => {
      setError('That image could not be opened.');
      resetEditor();
    };
    image.src = objectUrl;
  }

  function selectFile(event) {
    loadFile(event.target.files?.[0]);
  }

  function dropFile(event) {
    event.preventDefault();
    loadFile(event.dataTransfer.files?.[0]);
  }

  function startDragging(event) {
    if (!sourceImage) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      offsetX,
      offsetY,
    };
  }

  function dragImage(event) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const nextX = drag.offsetX + ((event.clientX - drag.x) / rect.width) * 200;
    const nextY = drag.offsetY + ((event.clientY - drag.y) / rect.height) * 200;
    setOffsetX(Math.max(-100, Math.min(100, nextX)));
    setOffsetY(Math.max(-100, Math.min(100, nextY)));
  }

  function stopDragging(event) {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  }

  async function uploadAvatar() {
    if (!canvasRef.current || !sourceImage) return;
    setBusy(true);
    setMessage('');
    setError('');

    try {
      const supabase = createClient();
      const blob = await canvasBlob(canvasRef.current);
      const path = `${userId}/avatar.webp`;
      const { error: uploadError } = await supabase.storage.from('avatars').upload(path, blob, {
        contentType: 'image/webp',
        cacheControl: '3600',
        upsert: true,
      });
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      const nextAvatarUrl = `${data.publicUrl}?v=${Date.now()}`;
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ avatar_url: nextAvatarUrl })
        .eq('id', userId);
      if (profileError) throw profileError;

      setAvatarUrl(nextAvatarUrl);
      resetEditor();
      setMessage('Avatar updated.');
    } catch (uploadError) {
      setError(uploadError.message || 'Could not update your avatar.');
    } finally {
      setBusy(false);
    }
  }

  async function removeAvatar() {
    setBusy(true);
    setMessage('');
    setError('');

    try {
      const supabase = createClient();
      const { error: storageError } = await supabase.storage
        .from('avatars')
        .remove([`${userId}/avatar.webp`]);
      if (storageError) throw storageError;

      const { error: profileError } = await supabase
        .from('profiles')
        .update({ avatar_url: null })
        .eq('id', userId);
      if (profileError) throw profileError;

      setAvatarUrl('');
      resetEditor();
      setMessage('Avatar removed.');
    } catch (removeError) {
      setError(removeError.message || 'Could not remove your avatar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4 border-b border-border pb-5" aria-labelledby="avatar-heading">
      <div>
        <h2 id="avatar-heading" className="font-heading text-sm font-semibold text-foreground">Profile photo</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Your photo may appear publicly on events you host or attend. JPEG, PNG, or WebP; 10 MB maximum.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary ring-1 ring-border">
          {avatarUrl ? (
            // A user-controlled Supabase public URL cannot be configured statically for next/image.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt="Current profile avatar"
              className="size-full object-cover"
              onError={() => setAvatarUrl('')}
            />
          ) : (
            // This local SVG is a reusable, resolution-independent 512px placeholder.
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/avatar-placeholder.svg" alt="Default profile avatar" className="size-full" />
          )}
        </div>
        <div
          onDragOver={(event) => event.preventDefault()}
          onDrop={dropFile}
          className="flex min-h-24 min-w-52 flex-1 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-input px-4 py-3 text-center transition-colors hover:border-primary hover:bg-primary/5"
        >
          <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={busy}>
            <ImagePlus className="size-4" />
            {avatarUrl ? 'Choose a new photo' : 'Choose a photo'}
          </Button>
          <p className="text-xs text-muted-foreground">Tap to choose, or drag and drop an image here</p>
          {avatarUrl && (
            <Button type="button" size="sm" variant="ghost" onClick={removeAvatar} disabled={busy}>
              <Trash2 className="size-4" />
              Remove
            </Button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={selectFile}
            className="sr-only"
          />
        </div>
      </div>

      {sourceImage && (
        <div className="grid gap-5 rounded-xl border border-border bg-muted/30 p-4 sm:grid-cols-[minmax(0,16rem)_1fr]">
          <div className="mx-auto aspect-square w-64 max-w-full self-start overflow-hidden rounded-full ring-2 ring-background shadow-sm">
            <canvas
              ref={canvasRef}
              width={AVATAR_SIZE}
              height={AVATAR_SIZE}
              onPointerDown={startDragging}
              onPointerMove={dragImage}
              onPointerUp={stopDragging}
              onPointerCancel={stopDragging}
              className="block size-full cursor-grab touch-none active:cursor-grabbing"
              aria-label="Cropped avatar preview. Drag to reposition the photo."
            />
          </div>
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">Drag the photo to position it inside the circle.</p>
            <div className="space-y-1.5">
              <Label htmlFor="avatar_zoom">Zoom</Label>
              <Input id="avatar_zoom" type="range" min="1" max="3" step="0.01" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="avatar_horizontal">Move left or right</Label>
              <Input id="avatar_horizontal" type="range" min="-100" max="100" value={offsetX} onChange={(event) => setOffsetX(Number(event.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="avatar_vertical">Move up or down</Label>
              <Input id="avatar_vertical" type="range" min="-100" max="100" value={offsetY} onChange={(event) => setOffsetY(Number(event.target.value))} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={uploadAvatar} disabled={busy}>
                {busy ? 'Saving…' : 'Save cropped photo'}
              </Button>
              <Button type="button" variant="outline" onClick={resetEditor} disabled={busy}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {message && <p role="status" className="text-sm font-medium text-green-700 dark:text-green-300">{message}</p>}
      {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
    </section>
  );
}
