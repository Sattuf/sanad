import { findGuide } from "@sanad/shared/content/ruqyah";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { AppText, Button, Card, Screen } from "@/components/ui";
import { guideTarget } from "@/lib/guideLinks";
import { space } from "@/theme";

/** دليل مكتوب (منهج، توعية، أو «الصحة والطمأنينة») — نصه وأدلته من الحزمة المشتركة كما هي. */
export default function GuideScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const guide = findGuide(id);
  if (!guide)
    return (
      <Screen>
        <AppText>لم نجد هذا الدليل.</AppText>
      </Screen>
    );
  return (
    <Screen>
      <Stack.Screen options={{ title: guide.title }} />
      <AppText variant="title">{guide.title}</AppText>
      <AppText variant="muted">{guide.subtitle}</AppText>
      <AppText>{guide.intro}</AppText>
      {guide.sections.map((s) => {
        const target = s.cta ? guideTarget(s.cta.to) : null;
        return (
          <Card key={s.heading}>
            <AppText variant="heading">{s.heading}</AppText>
            {s.points.map((p, i) => (
              <View key={i} style={{ gap: space.xs }}>
                <AppText>{`• ${p.text}`}</AppText>
                {p.evidence ? <AppText variant="dua" style={{ fontSize: 18, lineHeight: 34 }}>{p.evidence}</AppText> : null}
              </View>
            ))}
            {s.cta && target ? <Button label={s.cta.label} variant={s.cta.to === "/emergency" ? "primary" : "secondary"} onPress={() => router.push(target)} /> : null}
          </Card>
        );
      })}
    </Screen>
  );
}
