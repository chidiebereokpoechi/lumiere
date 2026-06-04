import { fetchMe } from '@/lib/api/galleries';
import { fetchWatermarkPresets } from '@/lib/api/watermarks';
import { WatermarkManager } from '@/components/admin/watermark-manager';

export const dynamic = 'force-dynamic';

export default async function WatermarksPage() {
  const [me, presets] = await Promise.all([
    fetchMe(),
    fetchWatermarkPresets().catch(() => []),
  ]);

  return (
    <WatermarkManager
      initialPresets={presets}
      user={{ name: me.name, email: me.email }}
    />
  );
}
