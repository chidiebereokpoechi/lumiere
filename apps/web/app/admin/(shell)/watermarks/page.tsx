import { fetchMe } from '@/lib/api/galleries';
import { fetchWatermarkPresets } from '@/lib/api/watermarks';
import { Topnav } from '@/components/admin/topnav';
import { WatermarkManager } from '@/components/admin/watermark-manager';

export const dynamic = 'force-dynamic';

export default async function WatermarksPage() {
  const [me, presets] = await Promise.all([
    fetchMe(),
    fetchWatermarkPresets().catch(() => []),
  ]);

  return (
    <div>
      <Topnav
        title="Watermarks"
        subtitle="Reusable text or logo overlays for preview-quality downloads."
        user={{ name: me.name, email: me.email }}
      />
      <div className="px-4 py-4 pb-16">
        <WatermarkManager initialPresets={presets} />
      </div>
    </div>
  );
}
