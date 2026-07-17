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
    berry_red: '#b8256f', red: '#db4035', orange: '#ff9933', yellow: '#fad000',
    olive_green: '#afb83b', green: '#7ecc49', forest_green: '#299438',
    mint_green: '#6accbc', teal: '#158fad', sky_blue: '#14aaf5',
    light_blue: '#96c3eb', blue: '#4073ff', grape: '#884dff',
    violet: '#af38eb', lavender: '#eb96eb', magenta: '#e05194',
    salmon: '#ff8d85', charcoal: '#808080', grey: '#b8b8b8', gray: '#b8b8b8'
  };
  return colors[colorName.toLowerCase()] || '#808080';
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
      <section className="bg-white dark:bg-[#131b2e] rounded-xl border border-[#eaedff] dark:border-[#283044] shadow-sm p-4 sm:p-6 flex flex-col h-full min-h-0">
        <div className="mb-4">
          <h3 className="font-display text-lg font-bold text-[#00288e] dark:text-white uppercase">TODOIST PROJECTS</h3>
          <p className="text-xs text-[#757684] mt-0.5">Project progress and active tasks</p>
        </div>

        {loadingProjects ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-[#00288e]" />
          </div>
        ) : projectsError ? (
          <div className="flex-1 flex flex-col justify-center items-center py-12 text-center">
            <AlertTriangle className="w-8 h-8 text-[#ba1a1a] mb-2" />
            <p className="text-xs text-[#ba1a1a] font-semibold">{projectsError}</p>
            <button
              onClick={() => fetchProjects(activeTab)}
              className="mt-3 px-3 py-1.5 bg-[#faf8ff] dark:bg-[#0c1322] border border-[#eaedff] dark:border-[#283044] rounded-md text-[10px] font-bold text-[#00288e] dark:text-white hover:bg-[#00288e] hover:text-white transition-colors"
            >
              Retry Load
            </button>
          </div>
        ) : todoistProjects.length === 0 ? (
          <div className="flex-1 flex flex-col justify-center items-center py-12">
            <Folder className="w-8 h-8 text-[#c4c5d5] mb-2" />
            <p className="text-xs text-[#757684]">No projects found in the current context.</p>
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
                  className="p-4 border border-[#eaedff] dark:border-[#283044] rounded-lg bg-white dark:bg-[#131b2e] relative transition-all"
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
                      <h4 className="text-xs font-bold text-[#131b2e] dark:text-white group-hover:text-[#00288e] dark:group-hover:text-[#a8b8ff] transition-colors truncate">
                        {proj.name}
                      </h4>
                      {proj.isFavorite && (
                        <span className="text-[9px] bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-400 px-1 py-0.2 rounded-sm font-bold flex-shrink-0">
                          ★ Fav
                        </span>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-[#757684] group-hover:text-[#131b2e] dark:group-hover:text-white" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-[#757684] group-hover:text-[#131b2e] dark:group-hover:text-white" />
                      )}
                    </div>
                  </div>

                  {/* Progress Metrics & Bar */}
                  <div className="mt-2.5">
                    <div className="flex justify-between items-center text-[10px] text-[#757684] mb-1">
                      <span>{proj.completedTaskCount} of {proj.totalTaskCount} tasks completed</span>
                      <span className="font-mono font-bold text-[#00288e] dark:text-[#a8b8ff]">{proj.percentageCompleted}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-[#f0f2ff] dark:bg-[#1a2333] rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-[#00288e] to-[#4073ff] rounded-full transition-all duration-500" 
                        style={{ width: `${proj.percentageCompleted}%` }}
                      />
                    </div>
                  </div>

                  {/* Lazy-loaded Project Tasks List */}
                  {isExpanded && (
                    <div className="mt-4 pt-3 border-t border-[#eaedff]/60 dark:border-[#283044]/40">
                      {isLoadingTasks ? (
                        <div className="py-4 flex justify-center items-center">
                          <Loader2 className="w-5 h-5 animate-spin text-[#00288e]" />
                        </div>
                      ) : tasksError ? (
                        <p className="text-[10px] text-[#ba1a1a] text-center font-semibold py-2">
                          {tasksError}
                        </p>
                      ) : tasksForProj.length === 0 ? (
                        <p className="text-[10px] text-[#757684] text-center italic py-2">
                          No active or completed tasks in this project.
                        </p>
                      ) : (
                        <div className="space-y-1">
                          {/* Build and Render Tree Nodes Recursively */}
                          {(() => {
                            const roots = buildTaskTree(tasksForProj);
                            
                            const renderTaskTreeNodes = (nodes: TaskNode[], depth: number = 0) => {
                              return (
                                <div className={`space-y-2 ${depth > 0 ? 'ml-4 pl-3 border-l border-[#eaedff]/60 dark:border-[#283044]/40 mt-1' : ''}`}>
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
                                                ? 'text-[#10b981]' 
                                                : isPending
                                                  ? 'text-[#757684] animate-pulse'
                                                  : 'text-[#c4c5d5] hover:text-[#00288e] dark:hover:text-[#a8b8ff]'
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
                                                ? 'text-[#757684] line-through decoration-[#757684]/60' 
                                                : 'text-[#131b2e] dark:text-white font-medium'
                                            }`}>
                                              {task.title}
                                            </p>
                                            
                                            {/* Meta */}
                                            <div className="flex flex-wrap items-center gap-2 mt-0.5 text-[9px] text-[#757684]">
                                              {isCompleted && task.completedAt && (
                                                <span className="bg-[#f0fdf4] dark:bg-[#10b981]/10 text-[#16a34a] dark:text-[#4ade80] px-1.5 py-0.5 rounded-sm">
                                                  Completed {new Date(task.completedAt).toLocaleDateString('en-GB')}
                                                </span>
                                              )}
                                              {!isCompleted && task.dueDate && (
                                                <span className={`px-1.5 py-0.5 rounded-sm ${
                                                  isOverdue 
                                                    ? 'bg-[#fef2f2] dark:bg-[#ef4444]/10 text-[#ef4444] font-bold animate-pulse' 
                                                    : 'bg-[#faf8ff] dark:bg-[#0c1322] text-[#757684]'
                                                }`}>
                                                  Due {new Date(task.dueDate).toLocaleDateString('en-GB')}
                                                </span>
                                              )}
                                              {task.recurring && (
                                                <span className="bg-[#f5f3ff] dark:bg-[#8b5cf6]/10 text-[#7c3aed] px-1.5 py-0.5 rounded-sm font-semibold">
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
