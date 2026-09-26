package app.lovable.a36e0c5ecda643f1907d9f0a7dc28fbb;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.widget.RemoteViews;

public class QuickActionsWidget extends AppWidgetProvider {

    static void updateAppWidget(Context context, AppWidgetManager appWidgetManager, int appWidgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_quick_actions);

        // 1. Attendance Action
        Intent attendanceIntent = new Intent(context, MainActivity.class);
        attendanceIntent.setAction(Intent.ACTION_VIEW);
        attendanceIntent.setData(Uri.parse("https://presences.dev/attendance"));
        attendanceIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent attendancePending = PendingIntent.getActivity(
                context, 201, attendanceIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.widget_action_attendance, attendancePending);

        // 2. Widgets Action
        Intent widgetsIntent = new Intent(context, MainActivity.class);
        widgetsIntent.setAction(Intent.ACTION_VIEW);
        widgetsIntent.setData(Uri.parse("https://presences.dev/widgets"));
        widgetsIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent widgetsPending = PendingIntent.getActivity(
                context, 202, widgetsIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.widget_action_widgets, widgetsPending);

        // 3. SmartBoard Action
        Intent boardIntent = new Intent(context, MainActivity.class);
        boardIntent.setAction(Intent.ACTION_VIEW);
        boardIntent.setData(Uri.parse("https://presences.dev/smartboard"));
        boardIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent boardPending = PendingIntent.getActivity(
                context, 203, boardIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.widget_action_smartboard, boardPending);

        appWidgetManager.updateAppWidget(appWidgetId, views);
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            updateAppWidget(context, appWidgetManager, appWidgetId);
        }
    }
}
