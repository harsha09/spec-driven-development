package coding.structuredvibe.sdd

import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.project.Project

object SddNotifier {
    fun info(project: Project?, message: String) {
        notify(project, message, NotificationType.INFORMATION)
    }

    fun error(project: Project?, message: String) {
        notify(project, message, NotificationType.ERROR)
    }

    private fun notify(project: Project?, message: String, type: NotificationType) {
        NotificationGroupManager.getInstance()
            .getNotificationGroup("SDD")
            .createNotification(message, type)
            .notify(project)
    }
}
