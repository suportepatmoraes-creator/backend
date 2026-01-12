import { z } from 'zod';
import { publicProcedure, protectedProcedure } from '../../create-context';
import { TRPCError } from '@trpc/server';

// Get notifications for the current user
export const getNotificationsProcedure = protectedProcedure
    .input(z.object({
        limit: z.number().min(1).max(50).default(20),
        cursor: z.string().uuid().optional()
    }))
    .query(async ({ input, ctx }) => {
        try {
            let query = ctx.supabase
                .from('notifications')
                .select(`
          *,
          actor:users!notifications_actor_id_fkey (
            id,
            username,
            display_name,
            profile_image,
            user_type
          )
        `)
                .eq('user_id', ctx.user.id)
                .order('created_at', { ascending: false })
                .limit(input.limit + 1);

            if (input.cursor) {
                const { data: cursorData } = await ctx.supabase
                    .from('notifications')
                    .select('created_at')
                    .eq('id', input.cursor)
                    .single();

                if (cursorData) {
                    query = query.lt('created_at', cursorData.created_at);
                }
            }

            const { data, error } = await query;

            if (error) throw error;

            const hasMore = data && data.length > input.limit;
            const notifications = hasMore ? data.slice(0, -1) : (data || []);
            const nextCursor = hasMore && notifications.length > 0
                ? notifications[notifications.length - 1].id
                : undefined;

            return {
                notifications,
                nextCursor,
                hasMore
            };
        } catch (error) {
            console.error('Error fetching notifications:', error);
            throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to fetch notifications'
            });
        }
    });

// Get unread notifications count
export const getUnreadCountProcedure = protectedProcedure
    .query(async ({ ctx }) => {
        try {
            const { count, error } = await ctx.supabase
                .from('notifications')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', ctx.user.id)
                .eq('is_read', false);

            if (error) throw error;

            return { count: count || 0 };
        } catch (error) {
            console.error('Error fetching unread count:', error);
            throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to fetch unread count'
            });
        }
    });

// Mark notification as read
export const markAsReadProcedure = protectedProcedure
    .input(z.object({
        notificationId: z.string().uuid()
    }))
    .mutation(async ({ input, ctx }) => {
        try {
            const { error } = await ctx.supabase
                .from('notifications')
                .update({ is_read: true })
                .eq('id', input.notificationId)
                .eq('user_id', ctx.user.id);

            if (error) throw error;

            return { success: true };
        } catch (error) {
            console.error('Error marking notification as read:', error);
            throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to mark notification as read'
            });
        }
    });

// Mark all notifications as read
export const markAllAsReadProcedure = protectedProcedure
    .mutation(async ({ ctx }) => {
        try {
            const { error } = await ctx.supabase
                .from('notifications')
                .update({ is_read: true })
                .eq('user_id', ctx.user.id)
                .eq('is_read', false);

            if (error) throw error;

            return { success: true };
        } catch (error) {
            console.error('Error marking all notifications as read:', error);
            throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to mark all notifications as read'
            });
        }
    });

// Helper function to create a notification
// Uses admin client to bypass RLS since user A needs to create notifications for user B
export async function createNotification(
    adminClient: any,
    userId: string,
    actorId: string,
    type: string,
    title: string,
    message: string,
    data: Record<string, any> = {}
) {
    console.log('[Notification] Creating notification:', { userId, actorId, type, title });

    // Don't create notification for self-actions
    if (userId === actorId) {
        console.log('[Notification] Skipping self-notification');
        return null;
    }

    if (!adminClient) {
        console.error('[Notification] Admin client not available');
        return null;
    }

    try {
        const insertData = {
            user_id: userId,
            actor_id: actorId,
            type,
            title,
            message,
            data
        };
        console.log('[Notification] Insert data:', insertData);

        const { data: notification, error } = await adminClient
            .from('notifications')
            .insert(insertData)
            .select()
            .single();

        if (error) {
            console.error('[Notification] Error creating notification:', error);
            console.error('[Notification] Error details:', JSON.stringify(error, null, 2));
            return null;
        }

        console.log('[Notification] Created successfully:', notification?.id);
        return notification;
    } catch (error) {
        console.error('[Notification] Exception creating notification:', error);
        return null;
    }
}
