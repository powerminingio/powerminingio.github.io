/*
 * Reading the ESP-IDF partition table out of the image we are about to flash.
 *
 * "Keep configuration" works by writing everything except the NVS partition,
 * so it needs NVS's exact offset and size. Those used to be hardcoded at
 * 0x9000/0x6000, which is wrong for any board that sizes NVS differently —
 * Bitcube's is 0xC000, so the old constant resumed writing 0x6000 bytes inside
 * the very region it was supposed to preserve. The image carries its own
 * partition table, so read the answer from there instead of assuming it.
 */

/** The partition table always lives at 0x8000, and may run to 0x9000. */
const TABLE_OFFSET = 0x8000
const TABLE_END = 0x9000

const ENTRY_SIZE = 32
const ENTRY_MAGIC = [0xaa, 0x50]

const TYPE_DATA = 0x01
const SUBTYPE_NVS = 0x02

export interface PartitionRegion {
  offset: number
  size: number
}

/**
 * Locate the NVS partition, or null when the image has no readable table.
 *
 * Entries are 32 bytes: magic(2) type(1) subtype(1) offset(4 LE) size(4 LE)
 * label(16) flags(4). The table ends at the first entry without the magic,
 * which is also where ESP-IDF's trailing 0xEBEB MD5 entry sits.
 */
export function findNvsRegion(image: Uint8Array): PartitionRegion | null {
  for (let at = TABLE_OFFSET; at + ENTRY_SIZE <= TABLE_END; at += ENTRY_SIZE) {
    if (at + ENTRY_SIZE > image.length) return null
    if (image[at] !== ENTRY_MAGIC[0] || image[at + 1] !== ENTRY_MAGIC[1]) return null

    if (image[at + 2] === TYPE_DATA && image[at + 3] === SUBTYPE_NVS) {
      const view = new DataView(image.buffer, image.byteOffset + at, ENTRY_SIZE)
      return { offset: view.getUint32(4, true), size: view.getUint32(8, true) }
    }
  }
  return null
}
