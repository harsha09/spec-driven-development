package coding.structuredvibe.sdd.actions

import coding.structuredvibe.sdd.SddCli
import coding.structuredvibe.sdd.SddNotifier
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.progress.Task
import com.intellij.openapi.ui.Messages
private fun runSdd(e: AnActionEvent, args: List<String>, successPrefix: String = "SDD") {
    val project = e.project
    if (project == null) {
        SddNotifier.error(null, "Open a project first.")
        return
    }
    ProgressManager.getInstance().run(object : Task.Backgroundable(project, "SDD: ${args.joinToString(" ")}", false) {
        override fun run(indicator: ProgressIndicator) {
            indicator.isIndeterminate = true
            try {
                val result = SddCli.run(project, args)
                ApplicationManager.getApplication().invokeLater {
                    if (result.ok) {
                        SddNotifier.info(project, "$successPrefix\n${result.stdout.take(500)}")
                    } else {
                        SddNotifier.error(
                            project,
                            "SDD failed (exit ${result.exitCode}). Is 'sdd' on PATH?\n${result.combined.take(800)}",
                        )
                    }
                }
            } catch (ex: Exception) {
                ApplicationManager.getApplication().invokeLater {
                    SddNotifier.error(project, "SDD error: ${ex.message}")
                }
            }
        }
    })
}

class SddInitAction : AnAction() {
    // Non-TTY process: Speckit-style default AI = copilot (use agents install to switch)
    override fun actionPerformed(e: AnActionEvent) =
        runSdd(e, listOf("init", "--here", "--ai", "copilot"), "Initialized")
}

class SddNewAction : AnAction() {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val title = Messages.showInputDialog(
            project,
            "Change title (spec-first)",
            "SDD: New Change",
            Messages.getQuestionIcon(),
        ) ?: return
        if (title.isBlank()) return
        runSdd(e, listOf("new", title, "-y"), "Created change")
    }
}

class SddStatusAction : AnAction() {
    override fun actionPerformed(e: AnActionEvent) = runSdd(e, listOf("status"), "Status")
}

class SddNextAction : AnAction() {
    override fun actionPerformed(e: AnActionEvent) = runSdd(e, listOf("next"), "Advanced")
}

class SddVerifyAction : AnAction() {
    override fun actionPerformed(e: AnActionEvent) = runSdd(e, listOf("verify"), "Verify")
}

class SddCompleteAction : AnAction() {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val ok = Messages.showYesNoDialog(
            project,
            "Complete the active change?",
            "SDD: Complete",
            Messages.getWarningIcon(),
        )
        if (ok != Messages.YES) return
        runSdd(e, listOf("complete"), "Completed")
    }
}

class SddAgentsRefreshAction : AnAction() {
    override fun actionPerformed(e: AnActionEvent) =
        runSdd(e, listOf("agents", "refresh"), "Agent context refreshed")
}

class SddAgentsInstallAction : AnAction() {
    override fun actionPerformed(e: AnActionEvent) =
        runSdd(e, listOf("agents", "install", "--ai", "copilot", "--force"), "Copilot agents installed")
}
