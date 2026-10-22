import { useEffect, useState, type JSX } from 'react'
import {
  AddIcon,
  PenNewSquareIcon,
  TrashBinMinimalisticIcon,
  UsersGroupRoundedIcon,
  UserRoundedIcon
} from '@renderer/components/ui/reicon'

import type { ChapterItem } from '../../../../../shared/contracts/chapters'
import type { AddressingDyadItem, CharacterItem } from '../../../../../shared/contracts/addressing'
import { Button } from '../../../components/ui/Button'
import { cn } from '../../../lib/cn'
import { CompactButton } from '../../../components/ui/CompactButton'
import { ICON } from '../../../components/ui/icon'
import { TabsList, TabsPanel, TabsRoot, TabsTab } from '../../../components/ui/Tabs'
import { EmptyState } from '../../../components/ui/EmptyState'
import { SearchInput } from '../../../components/ui/Input'
import { Select } from '../../../components/ui/Select'
import {
  DeleteCharacterDialog,
  DeleteDyadDialog,
  EditCharacterDialog,
  EditDyadDialog
} from './AddressingDialogs'
import { useAddressing } from './useAddressing'

export interface AddressingScreenProps {
  workId: string
}

export function AddressingScreen({ workId }: AddressingScreenProps): JSX.Element {
  const {
    characters,
    dyads,
    loading,
    error,
    query,
    setQuery,
    chapterFilter,
    setChapterFilter,
    createCharacter,
    updateCharacter,
    deleteCharacter,
    setDyad,
    deleteDyad
  } = useAddressing({ workId })

  const [activeTab, setActiveTab] = useState<'dyads' | 'characters'>('dyads')
  const [chapters, setChapters] = useState<ChapterItem[]>([])

  // Trạng thái các hộp thoại
  const [editingCharacter, setEditingCharacter] = useState<CharacterItem | null | 'new'>(null)
  const [deletingCharacter, setDeletingCharacter] = useState<CharacterItem | null>(null)
  const [editingDyad, setEditingDyad] = useState<AddressingDyadItem | null | 'new'>(null)
  const [deletingDyad, setDeletingDyad] = useState<AddressingDyadItem | null>(null)

  useEffect(() => {
    let active = true
    window.mira.chapters.list(workId).then((res) => {
      if (active && res.ok) {
        setChapters(res.value.chapters)
      }
    })
    return () => {
      active = false
    }
  }, [workId])

  const chapterMap = new Map<string, ChapterItem>(chapters.map((c) => [c.id, c]))
  const charMap = new Map<string, CharacterItem>(characters.map((c) => [c.id, c]))

  const formatChapterScope = (dyad: AddressingDyadItem): string => {
    if (!dyad.fromChapterId && !dyad.toChapterId) return 'Toàn bộ truyện'
    const from = dyad.fromChapterId
      ? `C.${chapterMap.get(dyad.fromChapterId)?.number ?? '?'}`
      : 'Đầu'
    const to = dyad.toChapterId ? `C.${chapterMap.get(dyad.toChapterId)?.number ?? '?'}` : 'Cuối'
    return `${from} → ${to}`
  }

  const chapterOptions = [
    { value: 'all', label: 'Tất cả chương' },
    ...chapters.map((c) => ({
      value: c.id,
      label: `Chương ${c.number}: ${c.title || 'Không tiêu đề'}`
    }))
  ]

  return (
    <div className="flex flex-col gap-4">
      {/* Thanh công cụ trên cùng */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput
            label="Tìm kiếm xưng hô hoặc nhân vật"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm theo tên nhân vật, đại từ..."
            className="w-60"
          />

          <div className="w-48">
            <Select
              label="Lọc theo chương"
              value={chapterFilter}
              options={chapterOptions}
              onChange={setChapterFilter}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button leftIcon={<AddIcon size={ICON.sm} />} onClick={() => setEditingCharacter('new')}>
            Thêm nhân vật
          </Button>

          <Button
            variant="solid"
            leftIcon={<AddIcon size={ICON.sm} />}
            onClick={() => setEditingDyad('new')}
            disabled={characters.length < 2}
            title={characters.length < 2 ? 'Cần ít nhất 2 nhân vật để tạo cặp xưng hô' : undefined}
          >
            Thêm xưng hô
          </Button>
        </div>
      </div>

      <TabsRoot
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as 'dyads' | 'characters')}
        className="flex flex-col gap-4"
      >
        {/* Danh sách tab con */}
        <TabsList className="flex">
          <TabsTab value="dyads">
            <UsersGroupRoundedIcon size={ICON.sm} />
            Quan hệ xưng hô ({dyads.length})
          </TabsTab>
          <TabsTab value="characters">
            <UserRoundedIcon size={ICON.sm} />
            Dàn nhân vật ({characters.length})
          </TabsTab>
        </TabsList>

        {error && (
          <div className="rounded-sm border border-error/30 bg-error/10 p-3 text-body-xs text-error">
            {error}
          </div>
        )}

        {/* Nội dung tab Quan hệ xưng hô */}
        <TabsPanel value="dyads">
          <div className="overflow-hidden rounded-sm border border-default bg-surface">
            <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1.4fr)_minmax(0,1fr)_90px] items-center border-b border-default bg-subtle px-3.5 py-2.5 text-body-xs font-medium text-subtle">
              <span>Người nói → Người nghe</span>
              <span>Từ xưng hô (Tự xưng – Gọi đối phương)</span>
              <span>Phạm vi hiệu lực</span>
              <span className="text-right">Thao tác</span>
            </div>

            {loading ? (
              <div className="py-12 text-center text-body-xs text-subtle">
                Đang tải ma trận xưng hô...
              </div>
            ) : dyads.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  icon={<UsersGroupRoundedIcon size={18} />}
                  title="Chưa có quy ước xưng hô nào"
                  actions={
                    characters.length >= 2 ? (
                      <Button
                        variant="solid"
                        leftIcon={<AddIcon size={ICON.sm} />}
                        onClick={() => setEditingDyad('new')}
                      >
                        Thêm quan hệ xưng hô đầu tiên
                      </Button>
                    ) : (
                      <Button
                        variant="solid"
                        leftIcon={<AddIcon size={ICON.sm} />}
                        onClick={() => setEditingCharacter('new')}
                      >
                        Thêm nhân vật trước
                      </Button>
                    )
                  }
                >
                  {characters.length < 2
                    ? 'Hãy thêm ít nhất 2 nhân vật để bắt đầu thiết lập ma trận xưng hô có chiều cho bản dịch.'
                    : 'Thiết lập cách một nhân vật tự xưng và gọi đối phương để AI dịch đối thoại tự nhiên, chính xác.'}
                </EmptyState>
              </div>
            ) : (
              <ul>
                {dyads.map((dyad) => {
                  const srcChar = charMap.get(dyad.sourceCharacterId)
                  const tgtChar = charMap.get(dyad.targetCharacterId)

                  return (
                    <li
                      key={dyad.id}
                      className={cn(
                        'grid grid-cols-[minmax(0,1.4fr)_minmax(0,1.4fr)_minmax(0,1fr)_90px] items-center border-b border-default px-3.5 py-3 text-body-sm last:border-b-0 hover:bg-surface/50 transition-colors',
                        dyad.status === 'pending' && 'bg-warning/5',
                        dyad.status === 'rejected' && 'opacity-60 bg-line/10'
                      )}
                    >
                      {/* Người nói -> Người nghe */}
                      <div className="flex flex-col gap-0.5">
                        <span className="font-semibold text-default flex items-center gap-1.5">
                          <span>{srcChar?.target ?? '?'}</span>
                          <span className="text-subtle text-body-xs">→</span>
                          <span>{tgtChar?.target ?? '?'}</span>
                        </span>
                        <span className="text-body-xs text-subtle truncate">
                          {srcChar?.source ?? '?'} → {tgtChar?.source ?? '?'}
                        </span>
                      </div>

                      {/* Đại từ xưng hô */}
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium text-default">
                          &ldquo;{dyad.speakerPronoun}&rdquo; &ndash; &ldquo;{dyad.recipientPronoun}
                          &rdquo;
                        </span>
                        {dyad.secondPerson && (
                          <span className="text-body-xs text-subtle">
                            Ngôi hai: &ldquo;{dyad.secondPerson}&rdquo;
                          </span>
                        )}
                        {dyad.formality && (
                          <span className="text-body-xs text-subtle">
                            Sắc thái: {dyad.formality}
                          </span>
                        )}
                        {dyad.notes && (
                          <span className="text-body-xs text-subtle truncate italic">
                            {dyad.notes}
                          </span>
                        )}
                      </div>

                      {/* Phạm vi áp dụng */}
                      <span className="text-body-xs text-subtle">{formatChapterScope(dyad)}</span>

                      {/* Các thao tác */}
                      <div className="flex items-center justify-end gap-1">
                        <CompactButton
                          icon={<PenNewSquareIcon size={ICON.sm} />}
                          aria-label="Chỉnh sửa quy ước"
                          title="Chỉnh sửa quy ước"
                          onClick={() => setEditingDyad(dyad)}
                        />
                        <CompactButton
                          tone="danger"
                          icon={<TrashBinMinimalisticIcon size={ICON.sm} />}
                          aria-label="Xóa quy ước"
                          title="Xóa quy ước"
                          onClick={() => setDeletingDyad(dyad)}
                        />
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </TabsPanel>

        {/* Nội dung tab Nhân vật */}
        <TabsPanel value="characters">
          <div className="overflow-hidden rounded-sm border border-default bg-surface">
            <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1.2fr)_90px_minmax(0,1.2fr)_90px] items-center border-b border-default bg-subtle px-3.5 py-2.5 text-body-xs font-medium text-subtle">
              <span>Tên tiếng Việt</span>
              <span>Tên gốc / Bí danh</span>
              <span>Giới tính</span>
              <span>Vai vế / Ghi chú</span>
              <span>Trạng thái</span>
              <span className="text-right">Thao tác</span>
            </div>

            {loading ? (
              <div className="py-12 text-center text-body-xs text-subtle">
                Đang tải danh sách nhân vật...
              </div>
            ) : characters.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  icon={<UserRoundedIcon size={18} />}
                  title="Chưa có nhân vật nào"
                  actions={
                    <Button
                      variant="solid"
                      leftIcon={<AddIcon size={ICON.sm} />}
                      onClick={() => setEditingCharacter('new')}
                    >
                      Thêm nhân vật đầu tiên
                    </Button>
                  }
                >
                  Thêm nhân vật và bí danh để quản lý vai vế và cách xưng hô đối thoại trong tác
                  phẩm.
                </EmptyState>
              </div>
            ) : (
              <ul>
                {characters.map((char) => (
                  <li
                    key={char.id}
                    className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1.2fr)_90px_minmax(0,1.2fr)_90px] items-center border-b border-default px-3.5 py-3 text-body-sm last:border-b-0 hover:bg-surface/50 transition-colors"
                  >
                    <span className="font-semibold text-default">{char.target}</span>

                    <div className="flex flex-col gap-0.5">
                      <span className="text-default">{char.source}</span>
                      {char.aliases.length > 0 && (
                        <span className="text-body-xs text-subtle truncate">
                          Bí danh: {char.aliases.join(', ')}
                        </span>
                      )}
                    </div>

                    <span className="text-body-xs text-subtle">
                      {char.gender === 'male'
                        ? 'Nam'
                        : char.gender === 'female'
                          ? 'Nữ'
                          : char.gender === 'other'
                            ? 'Khác'
                            : 'Chưa rõ'}
                    </span>

                    <div className="flex flex-col gap-0.5">
                      <span className="text-body-xs text-default">{char.role || '—'}</span>
                      {char.notes && (
                        <span className="text-body-xs text-subtle truncate italic">
                          {char.notes}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-end gap-1">
                      <CompactButton
                        icon={<PenNewSquareIcon size={ICON.sm} />}
                        aria-label="Chỉnh sửa nhân vật"
                        title="Chỉnh sửa nhân vật"
                        onClick={() => setEditingCharacter(char)}
                      />
                      <CompactButton
                        tone="danger"
                        icon={<TrashBinMinimalisticIcon size={ICON.sm} />}
                        aria-label="Xóa nhân vật"
                        title="Xóa nhân vật"
                        onClick={() => setDeletingCharacter(char)}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </TabsPanel>
      </TabsRoot>

      {/* Các hộp thoại quản lý nhân vật */}
      <EditCharacterDialog
        open={editingCharacter !== null}
        onOpenChange={(open) => !open && setEditingCharacter(null)}
        character={editingCharacter === 'new' ? null : editingCharacter}
        onSave={async (data) => {
          if (editingCharacter === 'new') {
            await createCharacter(data)
          } else if (editingCharacter) {
            await updateCharacter(editingCharacter.id, data)
          }
        }}
      />

      <DeleteCharacterDialog
        open={deletingCharacter !== null}
        onOpenChange={(open) => !open && setDeletingCharacter(null)}
        character={deletingCharacter}
        onConfirm={async () => {
          if (deletingCharacter) {
            await deleteCharacter(deletingCharacter.id)
          }
        }}
      />

      {/* Các hộp thoại quản lý quan hệ xưng hô */}
      <EditDyadDialog
        open={editingDyad !== null}
        onOpenChange={(open) => !open && setEditingDyad(null)}
        dyad={editingDyad === 'new' ? null : editingDyad}
        characters={characters}
        chapters={chapters}
        onSave={async (data) => {
          // The dialog has no second-person field yet: keep the pair's own.
          await setDyad({
            secondPerson: editingDyad && editingDyad !== 'new' ? editingDyad.secondPerson : null,
            ...data
          })
        }}
      />

      <DeleteDyadDialog
        open={deletingDyad !== null}
        onOpenChange={(open) => !open && setDeletingDyad(null)}
        dyad={deletingDyad}
        characters={characters}
        onConfirm={async () => {
          if (deletingDyad) {
            await deleteDyad(deletingDyad.id)
          }
        }}
      />
    </div>
  )
}
