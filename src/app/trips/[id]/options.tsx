import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, StyleSheet, View } from 'react-native';

import { friendlyError } from '@/lib/errors';
import { cacheInvite } from '@/lib/invite-link';
import { useSession } from '@/lib/session';
import type { Member } from '@/lib/types';
import { useLoad } from '@/lib/use-load';
import { chooseReportReason } from '@/screens/report';
import { showActions } from '@/ui/action-sheet';
import { Avatar } from '@/ui/avatar';
import { Txt } from '@/ui/primitives';
import { SettingsCard, SettingsRow } from '@/ui/settings-row';
import { SheetLayout } from '@/ui/sheet-layout';
import { SkeletonRows } from '@/ui/skeleton';
import { ErrorState } from '@/ui/states';
import { space } from '@/ui/theme';

export default function TripOptions() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { backend } = useSession();
  const { data: trip, error, reload } = useLoad(() => backend.getTrip(id));

  if (!trip) {
    return error ? (
      <ErrorState message={error} onRetry={reload} />
    ) : (
      <View style={{ padding: space.xl }}>
        <SkeletonRows count={3} />
      </View>
    );
  }

  async function attempt(fn: () => Promise<unknown>, failure: string) {
    try {
      await fn();
      return true;
    } catch (e) {
      Alert.alert(failure, friendlyError(e));
      return false;
    }
  }

  function memberActions(member: Member) {
    if (member.isMe) return;
    const actions = [
      {
        text: member.blocked ? `Unblock ${member.displayName}` : `Block ${member.displayName}`,
        destructive: !member.blocked,
        onPress: () => {
          if (member.blocked) {
            attempt(() => backend.setBlocked(member.userId, false), 'Couldn’t unblock').then(reload);
            return;
          }
          Alert.alert(
            `Block ${member.displayName}?`,
            'You won’t see their photos or videos in any trip you share. They aren’t notified.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Block', style: 'destructive', onPress: () => attempt(() => backend.setBlocked(member.userId, true), 'Couldn’t block').then(reload) },
            ],
          );
        },
      },
      {
        text: `Report ${member.displayName}`,
        onPress: () =>
          chooseReportReason(async (reason) => {
            if (await attempt(() => backend.report({ tripId: id, userId: member.userId, reason }), 'Couldn’t send report')) {
              Alert.alert('Report sent', 'Thanks. We review reports within 24 hours.');
            }
          }),
      },
    ];
    if (trip?.isOwner) {
      actions.push({
        text: 'Remove from trip',
        destructive: true,
        onPress: () =>
          Alert.alert(
            `Remove ${member.displayName}?`,
            'They lose access to this trip, everything they added to it is permanently deleted, and they can’t rejoin.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Remove', style: 'destructive', onPress: () => attempt(() => backend.removeMember(id, member.userId), 'Couldn’t remove').then(reload) },
            ],
          ),
      });
    }
    showActions(member.displayName, actions);
  }

  function leave() {
    const ownerNote = trip?.isOwner
      ? trip.members.length > 1
        ? ' You’re the organizer, so another member will take over.'
        : ' You’re the only member, so the trip will be deleted.'
      : '';
    Alert.alert(
      'Leave this trip?',
      `Everything you added to “${trip?.name}” will be permanently deleted, and you’ll lose access to the shared gallery.${ownerNote}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave trip',
          style: 'destructive',
          onPress: async () => {
            if (await attempt(() => backend.leaveTrip(id), 'Couldn’t leave trip')) {
              await cacheInvite(id, null);
              router.dismissTo('/');
            }
          },
        },
      ],
    );
  }

  function deleteTrip() {
    Alert.alert('Delete this trip for everyone?', 'All members lose access and every photo and video is permanently deleted. This can’t be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete trip',
        style: 'destructive',
        onPress: async () => {
          if (await attempt(() => backend.deleteTrip(id), 'Couldn’t delete trip')) {
            await cacheInvite(id, null);
            router.dismissTo('/');
          }
        },
      },
    ]);
  }

  return (
    <SheetLayout
      bottom={
        <SettingsCard>
          <SettingsRow icon="rectangle.portrait.and.arrow.right" label="Leave trip" destructive last={!trip.isOwner} onPress={leave} />
          {trip.isOwner ? (
            <SettingsRow icon="trash" label="Delete trip for everyone" destructive chevron last onPress={deleteTrip} />
          ) : null}
        </SettingsCard>
      }>
      <View style={{ gap: space.sm }}>
        <Txt variant="footnote" tone="secondary" style={styles.caption}>
          MEMBERS · {trip.members.length}
        </Txt>
        <SettingsCard>
          {trip.members.map((m, i) => {
            const name = m.isMe ? (m.displayName === 'You' ? 'You' : `${m.displayName} (you)`) : m.displayName;
            return (
              <SettingsRow
                key={m.userId}
                leading={<Avatar id={m.userId} name={m.displayName} url={m.avatarUrl} color={m.avatarColor} size={36} />}
                label={name}
                detail={
                  m.blocked ? (
                    <Txt variant="footnote" tone="danger">
                      Blocked
                    </Txt>
                  ) : m.role === 'owner' ? (
                    <Txt variant="footnote" tone="secondary">
                      Organizer
                    </Txt>
                  ) : null
                }
                chevron={!m.isMe}
                last={i === trip.members.length - 1}
                onPress={m.isMe ? undefined : () => memberActions(m)}
                accessibilityHint="Block, report or remove"
              />
            );
          })}
        </SettingsCard>
        <Txt variant="footnote" tone="tertiary" style={styles.caption}>
          Tap a member to block, report, or {trip.isOwner ? 'remove them' : 'ask us to review them'}. Blocking hides their
          memories from you only.
        </Txt>
      </View>

      {trip.isOwner || trip.status !== 'revealed' ? (
        <SettingsCard>
          {trip.isOwner ? (
            <SettingsRow
              icon="pencil"
              label="Edit name & cover"
              chevron
              last={trip.status === 'revealed'}
              onPress={() => router.push(`/trips/${id}/edit`)}
            />
          ) : null}
          {trip.status !== 'revealed' ? (
            <SettingsRow icon="link" label="Invite friends" chevron last onPress={() => router.push(`/trips/${id}/invite`)} />
          ) : null}
        </SettingsCard>
      ) : null}
    </SheetLayout>
  );
}

const styles = StyleSheet.create({
  caption: { paddingHorizontal: space.lg },
});
