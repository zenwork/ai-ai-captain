package com.local.aiaicaptain.bridge

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.project.Project
import com.intellij.openapi.application.ApplicationManager

class StartSessionAction : AnAction() {
    override fun actionPerformed(event: AnActionEvent) {
        val project = event.project ?: return
        val label = Messages.showInputDialog(project, "Session label", "AI AI Captain", null, "${project.name} AI session", null) ?: return
        val model = Messages.showInputDialog(project, "Model (optional)", "AI AI Captain", null, "", null)
        ApplicationManager.getApplication().executeOnPooledThread {
            project.getService(AiAiCaptainProjectService::class.java).report(label, model, "working")
        }
    }
}

class WaitSessionAction : AnAction() {
    override fun actionPerformed(event: AnActionEvent) {
        val project: Project = event.project ?: return
        ApplicationManager.getApplication().executeOnPooledThread {
            project.getService(AiAiCaptainProjectService::class.java).report("${project.name} AI session", null, "waiting")
        }
    }
}

class EndSessionAction : AnAction() {
    override fun actionPerformed(event: AnActionEvent) {
        val project = event.project ?: return
        ApplicationManager.getApplication().executeOnPooledThread {
            project.getService(AiAiCaptainProjectService::class.java).end()
        }
    }
}
