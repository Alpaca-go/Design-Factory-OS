import { useState } from 'react';
import { formatBytes } from '../utils';

export interface VisualAssetUploadItem {
  id: string;
  name: string;
  extension: string;
  bytes: number;
  thumbnailDataUrl?: string;
}

interface Props {
  role: 'current_project' | 'reference';
  items: VisualAssetUploadItem[];
  busy?: boolean;
  notice?: string;
  onAddPaths(paths: string[]): void | Promise<void>;
  onChooseFiles(): Promise<string[]>;
  onChooseFolder(): Promise<string[]>;
  onRemove?(id: string): void | Promise<void>;
  onClear?(): void | Promise<void>;
}

export function VisualAssetUploader({
  role,
  items,
  busy = false,
  notice,
  onAddPaths,
  onChooseFiles,
  onChooseFolder,
  onRemove,
  onClear
}: Props) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? items : items.slice(0, 8);
  const reference = role === 'reference';
  return <div className="visual-asset-uploader">
    <div className={`drop-zone intake-drop-zone ${busy ? 'busy' : ''}`} onDragOver={(event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    }} onDrop={(event) => {
      event.preventDefault();
      const paths = Array.from(event.dataTransfer.files)
        .map((file) => window.masterpiece.files.getPathForFile(file))
        .filter(Boolean);
      void onAddPaths(paths);
    }}>
      <div className="upload-orbit">↥</div>
      <strong>{busy ? '正在读取、过滤与去重…' : reference ? '拖入图片或文件夹，或点击选择' : '将 ZIP、图片、PDF 或文件夹拖到这里'}</strong>
      <p>{reference
        ? '建议上传 4–8 张能够代表整套视觉系统的关键图片。支持 JPG、JPEG、PNG、WebP、PDF、ZIP。'
        : '支持 ZIP、JPG、JPEG、PNG、WEBP、PDF，可多选'}</p>
      <div className="button-row">
        <button className="button secondary" type="button" disabled={busy} onClick={() => void onChooseFiles().then(onAddPaths)}>选择文件</button>
        <button className="button ghost" type="button" disabled={busy} onClick={() => void onChooseFolder().then(onAddPaths)}>选择文件夹</button>
      </div>
    </div>

    {notice && <div className="notice ok">{notice}</div>}
    {items.length > 0 && <div className="visual-uploader-selection">
      <div className="intake-heading">
        <div><small>已选择</small><h2>{items.length} 个文件</h2>
          {reference && items.length < 4 && <p className="inline-warning">当前参考图较少，跨图规律判断可能不够稳定。</p>}
          {reference && items.length > 12 && <p className="inline-warning">参考图较多，分析时间和 Token 消耗可能上升。</p>}
        </div>
        <div className="button-row">
          {items.length > 8 && <button className="button text-button" type="button" onClick={() => setShowAll((value) => !value)}>{showAll ? '收起' : `查看全部（仅展示前 8 个）`}</button>}
          {onClear && <button className="button danger" type="button" disabled={busy} onClick={() => void onClear()}>清空</button>}
        </div>
      </div>
      <div className="intake-thumbnails">
        {visible.map((item) => <div className="asset-card removable" key={item.id}>
          {onRemove && <button className="asset-remove" disabled={busy} title={`删除 ${item.name}`} aria-label={`删除 ${item.name}`} onClick={() => void onRemove(item.id)}>×</button>}
          {item.thumbnailDataUrl ? <img src={item.thumbnailDataUrl} alt="" /> : <div className="file-placeholder">{item.extension.replace('.', '').toUpperCase()}</div>}
          <strong title={item.name}>{item.name}</strong>
          <small>{formatBytes(item.bytes)}</small>
        </div>)}
      </div>
    </div>}
  </div>;
}

