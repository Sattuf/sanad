import { COUNTRY_CODES, flagEmoji, type CountryCode } from "@sanad/shared/lib/countryCodes";
import { useMemo, useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { fonts, radius, space, useColors } from "@/theme";
import { AppText, Button } from "./ui";

const SORTED = [...COUNTRY_CODES].sort((a, b) => a.name.localeCompare(b.name, "ar"));

/** منتقي رمز الدولة (كل دول العالم) — بحث بالاسم العربي أو بالرمز. */
export function CountryPicker({ value, onChange }: { value: CountryCode; onChange: (c: CountryCode) => void }) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const list = useMemo(() => {
    const q = query.trim().replace(/^\+/, "");
    return q ? SORTED.filter((x) => x.name.includes(q) || x.dialCode.includes(q) || x.iso2.toLowerCase() === q.toLowerCase()) : SORTED;
  }, [query]);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`رمز الدولة: ${value.name} ${value.dialCode}`}
        onPress={() => setOpen(true)}
        style={[styles.trigger, { borderColor: c.border, backgroundColor: c.surface }]}
      >
        <AppText>{`${flagEmoji(value.iso2)} ${value.dialCode}`}</AppText>
      </Pressable>
      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: c.bg, padding: space.lg, gap: space.md }}>
          <TextInput
            autoFocus
            placeholder="ابحث باسم الدولة أو الرمز"
            placeholderTextColor={c.muted}
            value={query}
            onChangeText={setQuery}
            style={[styles.search, { borderColor: c.border, backgroundColor: c.surface, color: c.text }]}
          />
          <FlatList
            data={list}
            keyExtractor={(x) => x.iso2}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  onChange(item);
                  setOpen(false);
                  setQuery("");
                }}
                style={[styles.row, { borderBottomColor: c.border }]}
              >
                <AppText>{`${flagEmoji(item.iso2)}  ${item.name}`}</AppText>
                <AppText variant="muted">{item.dialCode}</AppText>
              </Pressable>
            )}
          />
          <View>
            <Button label="إغلاق" variant="ghost" onPress={() => setOpen(false)} />
          </View>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: { minHeight: 50, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md, justifyContent: "center" },
  search: { minHeight: 48, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md, fontFamily: fonts.body, fontSize: 16, textAlign: "right" },
  row: { paddingVertical: space.md, flexDirection: "row", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth },
});
