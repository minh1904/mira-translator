import { useState, type JSX } from 'react'
import type { ChapterItem } from '../../../../../shared/contracts/chapters'
import type {
  AddressingDyadItem,
  CharacterGender,
  CharacterItem
} from '../../../../../shared/contracts/addressing'
import type { ContextStatus } from '../../../../../shared/contracts/glossary'
import { Alert } from '../../../components/ui/Alert'
import { Button } from '../../../components/ui/Button'
import { Dialog } from '../../../components/ui/Dialog'
import { Select, type SelectOption } from '../../../components/ui/Select'
import { TextareaField } from '../../../components/ui/Field'
import { TextField } from '../../../components/ui/Field'

// -------------------------------------------------------------
// Hộp thoại quản lý nhân vật
// -------------------------------------------------------------

interface EditCharacterDialogProps {
  open: boolean
  onOpenChange(open: boolean): void
  character: CharacterItem | null
  onSave(data: {
    source: string
    target: string
    gender: CharacterGender
    role: string | null
    status: ContextStatus
    notes: string | null
    aliases: string[]
  }): Promise<void>
}

export function EditCharacterDialog({
  open,
  onOpenChange,
  character,
  onSave
}: EditCharacterDialogProps): JSX.Element {
  const isEditing = character !== null

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      title={isEditing ? 'Chỉnh sửa nhân vật' : 'Thêm nhân vật mới'}
      description={
        isEditing
          ? 'Cập nhật tên, giới tính, vai vế và bí danh của nhân vật.'
          : 'Thêm thông tin nhân vật để quản lý ma trận xưng hô trong truyện.'
      }
    >
      {open && (
        <EditCharacterForm
          key={character?.id ?? 'new'}
          character={character}
          onClose={() => onOpenChange(false)}
          onSave={onSave}
        />
      )}
    </Dialog>
  )
}

function EditCharacterForm({
  character,
  onClose,
  onSave
}: {
  character: CharacterItem | null
  onClose(): void
  onSave: EditCharacterDialogProps['onSave']
}): JSX.Element {
  const [target, setTarget] = useState(character?.target ?? '')
  const [source, setSource] = useState(character?.source ?? '')
  const [gender, setGender] = useState<CharacterGender>(character?.gender ?? 'unknown')
  const [role, setRole] = useState(character?.role ?? '')
  const [aliasesText, setAliasesText] = useState((character?.aliases ?? []).join(', '))

  const [notes, setNotes] = useState(character?.notes ?? '')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!target.trim() || !source.trim()) {
      setError('Vui lòng nhập cả tên tiếng Việt và tên gốc của nhân vật.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      const aliases = aliasesText
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean)

      await onSave({
        source: source.trim(),
        target: target.trim(),
        gender,
        role: role.trim() || null,
        status: 'approved',
        notes: notes.trim() || null,
        aliases
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi khi lưu nhân vật.')
    } finally {
      setSaving(false)
    }
  }

  const genderOptions: SelectOption<CharacterGender>[] = [
    { value: 'unknown', label: 'Chưa rõ' },
    { value: 'male', label: 'Nam' },
    { value: 'female', label: 'Nữ' },
    { value: 'other', label: 'Khác' }
  ]

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && (
        <Alert tone="error" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="Tên tiếng Việt"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder="Ví dụ: Hàn Lập"
          required
          autoFocus
        />
        <TextField
          label="Tên gốc trong bản dịch"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder="Ví dụ: 韩立"
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Select
          label="Giới tính"
          value={gender}
          options={genderOptions}
          onChange={(val) => setGender(val as CharacterGender)}
        />
        <TextField
          label="Vai vế / vai trò"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder="Ví dụ: Nhân vật chính, Đạo lữ..."
        />
      </div>

      <TextField
        label="Bí danh / Dạng viết khác (ngăn cách bởi dấu phẩy)"
        value={aliasesText}
        onChange={(e) => setAliasesText(e.target.value)}
        placeholder="Ví dụ: Lập Ca, Hàn Trưởng Lão"
      />

      <TextareaField
        label="Ghi chú nhân vật"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Ghi chú tính cách, hoàn cảnh xuất hiện..."
        rows={2}
      />

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" onClick={onClose} disabled={saving}>
          Hủy
        </Button>
        <Button variant="solid" type="submit" disabled={saving}>
          {saving ? 'Đang lưu...' : 'Lưu nhân vật'}
        </Button>
      </div>
    </form>
  )
}

interface DeleteCharacterDialogProps {
  open: boolean
  onOpenChange(open: boolean): void
  character: CharacterItem | null
  onConfirm(): Promise<void>
}

export function DeleteCharacterDialog({
  open,
  onOpenChange,
  character,
  onConfirm
}: DeleteCharacterDialogProps): JSX.Element {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleConfirm = async (): Promise<void> => {
    setDeleting(true)
    setError(null)
    try {
      await onConfirm()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể xóa nhân vật.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Xóa nhân vật"
      description={`Bạn có chắc chắn muốn xóa nhân vật "${character?.target}" (${character?.source})? Mọi quan hệ xưng hô gắn với nhân vật này cũng sẽ bị xóa.`}
    >
      {error && (
        <Alert tone="error" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <Button onClick={() => onOpenChange(false)} disabled={deleting}>
          Hủy
        </Button>
        <Button color="danger" variant="solid" onClick={handleConfirm} disabled={deleting}>
          {deleting ? 'Đang xóa...' : 'Xóa nhân vật'}
        </Button>
      </div>
    </Dialog>
  )
}

// -------------------------------------------------------------
// Hộp thoại quản lý quan hệ xưng hô (cặp nhân vật)
// -------------------------------------------------------------

interface EditDyadDialogProps {
  open: boolean
  onOpenChange(open: boolean): void
  dyad: AddressingDyadItem | null
  characters: CharacterItem[]
  chapters: ChapterItem[]
  onSave(data: {
    dyadId?: string
    sourceCharacterId: string
    targetCharacterId: string
    speakerPronoun: string
    recipientPronoun: string
    formality?: string | null
    fromChapterId?: string | null
    toChapterId?: string | null
    status?: ContextStatus
    notes?: string | null
  }): Promise<void>
}

export function EditDyadDialog({
  open,
  onOpenChange,
  dyad,
  characters,
  chapters,
  onSave
}: EditDyadDialogProps): JSX.Element {
  const isEditing = dyad !== null

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      title={isEditing ? 'Chỉnh sửa quan hệ xưng hô' : 'Thiết lập quan hệ xưng hô'}
      description={
        isEditing
          ? 'Cập nhật từ tự xưng và từ gọi đối phương cho cặp nhân vật.'
          : 'Định nghĩa cách một nhân vật xưng hô khi nói chuyện với nhân vật khác.'
      }
    >
      {open && (
        <EditDyadForm
          key={dyad?.id ?? 'new'}
          dyad={dyad}
          characters={characters}
          chapters={chapters}
          onClose={() => onOpenChange(false)}
          onSave={onSave}
        />
      )}
    </Dialog>
  )
}

function EditDyadForm({
  dyad,
  characters,
  chapters,
  onClose,
  onSave
}: {
  dyad: AddressingDyadItem | null
  characters: CharacterItem[]
  chapters: ChapterItem[]
  onClose(): void
  onSave: EditDyadDialogProps['onSave']
}): JSX.Element {
  const [sourceId, setSourceId] = useState(
    dyad?.sourceCharacterId ?? (characters.length > 0 ? characters[0].id : '')
  )
  const [targetId, setTargetId] = useState(
    dyad?.targetCharacterId ?? (characters.length > 1 ? characters[1].id : '')
  )
  const [speakerPronoun, setSpeakerPronoun] = useState(dyad?.speakerPronoun ?? '')
  const [recipientPronoun, setRecipientPronoun] = useState(dyad?.recipientPronoun ?? '')
  const [formality, setFormality] = useState(dyad?.formality ?? '')
  const [fromChapterId, setFromChapterId] = useState(dyad?.fromChapterId ?? 'all')
  const [toChapterId, setToChapterId] = useState(dyad?.toChapterId ?? 'all')

  const [notes, setNotes] = useState(dyad?.notes ?? '')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!sourceId || !targetId) {
      setError('Vui lòng chọn cả người nói và người nghe.')
      return
    }
    if (sourceId === targetId) {
      setError('Người nói và người nghe không được là cùng một người.')
      return
    }
    if (!speakerPronoun.trim() || !recipientPronoun.trim()) {
      setError('Vui lòng nhập cả từ tự xưng và từ gọi đối phương.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      await onSave({
        dyadId: dyad?.id,
        sourceCharacterId: sourceId,
        targetCharacterId: targetId,
        speakerPronoun: speakerPronoun.trim(),
        recipientPronoun: recipientPronoun.trim(),
        formality: formality.trim() || null,
        fromChapterId: fromChapterId === 'all' ? null : fromChapterId,
        toChapterId: toChapterId === 'all' ? null : toChapterId,
        status: 'approved',
        notes: notes.trim() || null
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi khi lưu quan hệ xưng hô.')
    } finally {
      setSaving(false)
    }
  }

  const characterOptions: SelectOption<string>[] = characters.map((c) => ({
    value: c.id,
    label: `${c.target} (${c.source})`
  }))

  const chapterOptions: SelectOption<string>[] = [
    { value: 'all', label: 'Không giới hạn' },
    ...chapters.map((c) => ({
      value: c.id,
      label: `Chương ${c.number}: ${c.title || 'Không tiêu đề'}`
    }))
  ]

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && (
        <Alert tone="error" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Select
          label="Người nói"
          value={sourceId}
          options={characterOptions}
          onChange={setSourceId}
        />
        <Select
          label="Người nghe"
          value={targetId}
          options={characterOptions}
          onChange={setTargetId}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="Từ tự xưng (ngôi thứ nhất)"
          value={speakerPronoun}
          onChange={(e) => setSpeakerPronoun(e.target.value)}
          placeholder="Ví dụ: ta, huynh, tôi, đệ..."
          required
          autoFocus
        />
        <TextField
          label="Từ gọi đối phương (ngôi thứ hai)"
          value={recipientPronoun}
          onChange={(e) => setRecipientPronoun(e.target.value)}
          placeholder="Ví dụ: nàng, muội, ngươi, cô nương..."
          required
        />
      </div>

      <TextField
        label="Sắc thái / độ trang trọng"
        value={formality}
        onChange={(e) => setFormality(e.target.value)}
        placeholder="Ví dụ: thân mật, trang trọng, lạnh nhạt..."
      />

      <div className="grid grid-cols-2 gap-3">
        <Select
          label="Hiệu lực từ chương"
          value={fromChapterId}
          options={chapterOptions}
          onChange={setFromChapterId}
        />
        <Select
          label="Đến hết chương"
          value={toChapterId}
          options={chapterOptions}
          onChange={setToChapterId}
        />
      </div>

      <TextareaField
        label="Ghi chú hoàn cảnh xưng hô"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Ghi chú ngữ cảnh áp dụng xưng hô..."
        rows={2}
      />

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" onClick={onClose} disabled={saving}>
          Hủy
        </Button>
        <Button variant="solid" type="submit" disabled={saving}>
          {saving ? 'Đang lưu...' : 'Lưu quy ước'}
        </Button>
      </div>
    </form>
  )
}

interface DeleteDyadDialogProps {
  open: boolean
  onOpenChange(open: boolean): void
  dyad: AddressingDyadItem | null
  characters: CharacterItem[]
  onConfirm(): Promise<void>
}

export function DeleteDyadDialog({
  open,
  onOpenChange,
  dyad,
  characters,
  onConfirm
}: DeleteDyadDialogProps): JSX.Element {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const charMap = new Map(characters.map((c) => [c.id, c]))
  const srcName = dyad ? (charMap.get(dyad.sourceCharacterId)?.target ?? '?') : '?'
  const tgtName = dyad ? (charMap.get(dyad.targetCharacterId)?.target ?? '?') : '?'

  const handleConfirm = async (): Promise<void> => {
    setDeleting(true)
    setError(null)
    try {
      await onConfirm()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể xóa quan hệ xưng hô.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Xóa quan hệ xưng hô"
      description={`Bạn có chắc chắn muốn xóa quy ước xưng hô từ "${srcName}" đến "${tgtName}" ("${dyad?.speakerPronoun}" - "${dyad?.recipientPronoun}")?`}
    >
      {error && (
        <Alert tone="error" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <Button onClick={() => onOpenChange(false)} disabled={deleting}>
          Hủy
        </Button>
        <Button color="danger" variant="solid" onClick={handleConfirm} disabled={deleting}>
          {deleting ? 'Đang xóa...' : 'Xóa quy ước'}
        </Button>
      </div>
    </Dialog>
  )
}
