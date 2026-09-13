import React from 'react';
import {
  Loader2,
  AlertTriangle,
  Folder,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Square
} from 'lucide-react';
import { TodoistProjectSummary, TodoistProjectTask } from '../types';

interface TaskNode {
  task: TodoistProjectTask;
  children: TaskNode[];
}

const getTodoistColorHex = (colorName: string): string => {
  const colors: Record<string, string> = {
    berry_red: 'var(--color-warning)', red: 'var(--color-warning)', orange: 'var(--color-warning)', yellow: 'var(--color-warning)',
    olive_green: 'var(--color-warning)', green: 'var(--color-success)', forest_green: 'var(--color-success)',
    mint_green: 'var(--color-secondary)', teal: 'var(--color-secondary)', sky_blue: 'var(--color-secondary)',
    light_blue: 'var(--color-secondary)', blue: 'var(--color-secondary)', grape: 'var(--color-secondary)',
    violet: 'var(--color-secondary)', lavender: 'var(--color-secondary)', magenta: 'var(--color-warning)',
    salmon: 'var(--color-warning-surface)', charcoal: 'var(--color-secondary)', grey: 'var(--color-secondary)', gray: 'var(--color-secondary)'
  };
  return colors[colorName.toLowerCase()] || 'var(--color-secondary)';
};

function buildTaskTree(tasks: TodoistProjectTask[]): TaskNode[] {
  const nodeMap = new Map<string, TaskNode>();
  const roots: TaskNode[] = [];

  // Create nodes for all tasks
  for (const t of tasks) {
    nodeMap.set(t.id, { task: t, children: [] });
  }

  // Link nodes
  for (const t of tasks) {
    const node = nodeMap.get(t.id);
    if (node) {
      if (t.parentId && nodeMap.has(t.parentId)) {
        const parentNode = nodeMap.get(t.parentId);
        if (parentNode) {
          parentNode.children.push(node);
        } else {
          roots.push(node);
        }
      } else {
        roots.push(node);
      }
    }
  }

  return roots;
}

export interface TodoistProjectsPanelProps {
  loadingProjects: boolean;
  projectsError: string | null;
  todoistProjects: TodoistProjectSummary[];
  activeTab: string;
  fetchProjects: (tab: string) => Promise<void>;
  expandedProjectIds: Record<string, boolean>;
  projectTasks: Record<string, TodoistProjectTask[]>;
  loadingProjectTasks: Record<string, boolean>;
  projectTasksError: Record<string, string | null>;
  toggleProjectExpand: (projectId: string) => void;
  completingTaskIds: Set<string>;
  handleCompleteProjectTask: (taskId: string, projectId: string) => void;
}

export const TodoistProjectsPanel: React.FC<TodoistProjectsPanelProps> = ({
  loadingProjects,
  projectsError,
  todoistProjects,
  activeTab,
  fetchProjects,
  expandedProjectIds,
  projectTasks,
  loadingProjectTasks,
  projectTasksError,
  toggleProjectExpand,
  completingTaskIds,
  handleCompleteProjectTask,
}) => {
  return (
    <div className="flex flex-col min-h-0">
      <section className="bg-[var(--color-card)] bg-[var(--color-card)] rounded-xl border border-[var(--color-divider)] border-[var(--color-divider)] shadow-sm p-4 sm:p-6 flex flex-col h-full min-h-0">
        <div className="mb-4">
          <h3 className="font-display text-lg font-semibold text-[var(--color-control)] text-[var(--color-ink)] uppercase">TODOIST PROJECTS</h3>
          <p className="text-xs text-[var(--color-secondary)] mt-0.5">Project progress and active tasks</p>
        </div>

        {loadingProjects ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-[var(--color-control)]" />
          </div>
        ) : projectsError ? (
          <div className="flex-1 flex flex-col justify-center items-center py-12 text-center">
            <AlertTriangle className="w-8 h-8 text-[var(--color-warning)] mb-2" />
            <p className="text-xs text-[var(--color-warning)] font-semibold">{projectsError}</p>
            <button
              onClick={() => fetchProjects(activeTab)}
              className="mt-3 px-3 py-1.5 bg-[var(--color-card-raised)] bg-[var(--color-card)] border border-[var(--color-divider)] border-[var(--color-divider)] rounded-md text-[10px] font-semibold text-[var(--color-control)] text-[var(--color-ink)] hover:bg-[var(--color-card-raised)] hover:text-[var(--color-ink)] transition-colors"
            >
              Retry Load
            </button>
          </div>
        ) : todoistProjects.length === 0 ? (
          <div className="flex-1 flex flex-col justify-center items-center py-12">
            <Folder className="w-8 h-8 text-[var(--color-divider)] mb-2" />
            <p className="text-xs text-[var(--color-secondary)]">No projects found in the current context.</p>
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-2 text-left max-h-[30rem] lg:max-h-none">
            {todoistProjects.map(proj => {
              const isExpanded = !!expandedProjectIds[proj.id];
              const tasksForProj = projectTasks[proj.id] || [];
              const isLoadingTasks = !!loadingProjectTasks[proj.id];
              const tasksError = projectTasksError[proj.id];

              return (
                <div
                  key={proj.id}
                  className="p-4 border border-[var(--color-divider)] border-[var(--color-divider)] rounded-lg bg-[var(--color-card)] bg-[var(--color-card)] relative transition-all"
                >
                  {/* Project Header */}
                  <div
                    onClick={() => toggleProjectExpand(proj.id)}
                    className="flex justify-between items-start gap-4 cursor-pointer group"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {/* Color Dot Accent */}
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: getTodoistColorHex(proj.color) }}
                      />
                      <h4 className="text-xs font-semibold text-[var(--color-ink)] text-[var(--color-ink)] group-hover:text-[var(--color-control)] group-hover:text-[var(--color-secondary)] transition-colors truncate">
                        {proj.name}
                      </h4>
                      {proj.isFavorite && (
                        <span className="text-[9px] bg-[var(--color-warning-surface)] bg-[var(--color-warning-surface)] text-[var(--color-warning)] text-[var(--color-warning)] px-1 py-0.2 rounded-sm font-semibold flex-shrink-0">
                          ★ Fav
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-[var(--color-secondary)] group-hover:text-[var(--color-ink)] group-hover:text-[var(--color-ink)]" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-[var(--color-secondary)] group-hover:text-[var(--color-ink)] group-hover:text-[var(--color-ink)]" />
                      )}
                    </div>
                  </div>

                  {/* Progress Metrics & Bar */}
                  <div className="mt-2.5">
                    <div className="flex justify-between items-center text-[10px] text-[var(--color-secondary)] mb-1">
                      <span>{proj.completedTaskCount} of {proj.totalTaskCount} tasks completed</span>
                      <span className="font-mono font-semibold text-[var(--color-control)] text-[var(--color-secondary)]">{proj.percentageCompleted}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-[var(--color-card-raised)] bg-[var(--color-card)] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-[var(--color-control)] to-[var(--color-secondary)] rounded-full transition-all duration-500"
                        style={{ width: `${proj.percentageCompleted}%` }}
                      />
                    </div>
                  </div>

                  {/* Lazy-loaded Project Tasks List */}
                  {isExpanded && (
                    <div className="mt-4 pt-3 border-t border-[var(--color-divider)]/60 border-[var(--color-divider)]/40">
                      {isLoadingTasks ? (
                        <div className="py-4 flex justify-center items-center">
                          <Loader2 className="w-5 h-5 animate-spin text-[var(--color-control)]" />
                        </div>
                      ) : tasksError ? (
                        <p className="text-[10px] text-[var(--color-warning)] text-center font-semibold py-2">
                          {tasksError}
                        </p>
                      ) : tasksForProj.length === 0 ? (
                        <p className="text-[10px] text-[var(--color-secondary)] text-center italic py-2">
                          No active or completed tasks in this project.
                        </p>
                      ) : (
                        <div className="space-y-1">
                          {/* Build and Render Tree Nodes Recursively */}
                          {(() => {
                            const roots = buildTaskTree(tasksForProj);

                            const renderTaskTreeNodes = (nodes: TaskNode[], depth: number = 0) => {
                              return (
                                <div className={`space-y-2 ${depth > 0 ? 'ml-4 pl-3 border-l border-[var(--color-divider)]/60 border-[var(--color-divider)]/40 mt-1' : ''}`}>
                                  {nodes.map(node => {
                                    const { task } = node;
                                    const isCompleted = !!task.completed;
                                    const isPending = completingTaskIds.has(task.id);
                                    const isOverdue = !isCompleted && task.dueDate && new Date(task.dueDate) < new Date(new Date().setHours(0,0,0,0));

                                    return (
                                      <div key={task.id} className="space-y-1">
                                        <div className="flex items-start gap-2 group/task py-0.5">
                                          {/* Checkbox */}
                                          <button
                                            onClick={() => !isCompleted && !isPending && handleCompleteProjectTask(task.id, proj.id)}
                                            disabled={isCompleted || isPending}
                                            className={`mt-0.5 flex-shrink-0 transition-colors focus:outline-hidden ${
                                              isCompleted
                                                ? 'text-[var(--color-success)]'
                                                : isPending
                                                  ? 'text-[var(--color-secondary)] animate-pulse'
                                                  : 'text-[var(--color-divider)] hover:text-[var(--color-control)] hover:text-[var(--color-secondary)]'
                                            }`}
                                          >
                                            {isCompleted ? (
                                              <CheckCircle2 className="w-4 h-4" />
                                            ) : isPending ? (
                                              <Loader2 className="w-4 h-4 animate-spin" />
                                            ) : (
                                              <Square className="w-4 h-4" />
                                            )}
                                          </button>

                                          <div className="flex-1 min-w-0">
                                            {/* Content */}
                                            <p className={`text-xs leading-relaxed break-words ${
                                              isCompleted
                                                ? 'text-[var(--color-secondary)] line-through decoration-[var(--color-secondary)]/60'
                                                : 'text-[var(--color-ink)] text-[var(--color-ink)] font-normal'
                                            }`}>
                                              {task.title}
                                            </p>

                                            {/* Meta */}
                                            <div className="flex flex-wrap items-center gap-2 mt-0.5 text-[9px] text-[var(--color-secondary)]">
                                              {isCompleted && task.completedAt && (
                                                <span className="bg-[var(--color-success-surface)] bg-[var(--color-success)]/10 text-[var(--color-success)] text-[var(--color-success)] px-1.5 py-0.5 rounded-sm">
                                                  Completed {new Date(task.completedAt).toLocaleDateString('en-GB')}
                                                </span>
                                              )}
                                              {!isCompleted && task.dueDate && (
                                                <span className={`px-1.5 py-0.5 rounded-sm ${
                                                  isOverdue
                                                    ? 'bg-[var(--color-warning-surface)] bg-[var(--color-warning-surface)]/10 text-[var(--color-warning)] font-semibold animate-pulse'
                                                    : 'bg-[var(--color-card-raised)] bg-[var(--color-card)] text-[var(--color-secondary)]'
                                                }`}>
                                                  Due {new Date(task.dueDate).toLocaleDateString('en-GB')}
                                                </span>
                                              )}
                                              {task.recurring && (
                                                <span className="bg-[var(--color-card-raised)] bg-[var(--color-card-raised)]/10 text-[var(--color-secondary)] px-1.5 py-0.5 rounded-sm font-semibold">
                                                  🔁 Recurring
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                        </div>

                                        {/* Render Nested Children Recursively */}
                                        {node.children.length > 0 && renderTaskTreeNodes(node.children, depth + 1)}
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            };

                            return renderTaskTreeNodes(roots);
                          })()}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
