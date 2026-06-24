import { Injectable } from "@nestjs/common";
import { ActionType, Link, Node } from "../../../shared/types/graph-data.type";
import {
  GraphNodeWithProfiles,
  InteractionWithNodes,
  OrgNameMaps,
} from "./graph-query.service";

@Injectable()
export class GraphAssemblerService {
  buildNodes(
    interactions: InteractionWithNodes[],
    directNodes: GraphNodeWithProfiles[],
    orgNames: OrgNameMaps,
    classId?: string,
  ): Node[] {
    const nodeMap = new Map<string, Node>();

    for (const interaction of interactions) {
      if (classId) {
        if (
          interaction.sourceNode.nodeType !== "Student" ||
          interaction.sourceNode.classId === classId
        ) {
          this.putNode(nodeMap, interaction.sourceNode, orgNames);
        }
        if (
          interaction.targetNode.nodeType !== "Student" ||
          interaction.targetNode.classId === classId
        ) {
          this.putNode(nodeMap, interaction.targetNode, orgNames);
        }
        continue;
      }

      this.putNode(nodeMap, interaction.sourceNode, orgNames);
      this.putNode(nodeMap, interaction.targetNode, orgNames);
    }

    for (const node of directNodes) {
      this.putNode(nodeMap, node, orgNames);
    }

    return Array.from(nodeMap.values());
  }

  buildLinks(interactions: InteractionWithNodes[]): Link[] {
    return interactions.map((interaction) => ({
      source: interaction.sourceNodeId,
      target: interaction.targetNodeId,
      value: Number(interaction.strength),
      type:
        interaction.interactionType === "PHYSICAL" ? "PHYSICAL" : "PLATFORM",
      actionType: (interaction.actionType as ActionType) ?? null,
      createdAt: interaction.createdAt.toISOString(),
    }));
  }

  private putNode(
    nodeMap: Map<string, Node>,
    node: GraphNodeWithProfiles,
    orgNames: OrgNameMaps,
  ) {
    if (nodeMap.has(node.id)) {
      return;
    }

    if (node.nodeType?.toUpperCase() === "STUDENT") {
      nodeMap.set(node.id, {
        id: node.id,
        type: "STUDENT",
        name: node.displayName,
        group: 3,
        val: 8,
        studentProfile: {
          school: node.schoolId
            ? orgNames.schoolNames.get(node.schoolId) ?? node.schoolId
            : null,
          grade: node.gradeId
            ? orgNames.gradeNames.get(node.gradeId) ?? node.gradeId
            : null,
          classId: node.classId
            ? orgNames.classNames.get(node.classId) ?? node.classId
            : null,
          externalUserId: node.studentProfile?.externalUserId ?? null,
        },
      });
      return;
    }

    if (node.nodeType?.toUpperCase() === "TEACHER") {
      nodeMap.set(node.id, {
        id: node.id,
        type: "TEACHER",
        name: node.displayName,
        group: 1,
        val: 25,
        teacherProfile: {
          school: node.schoolId
            ? orgNames.schoolNames.get(node.schoolId) ?? node.schoolId
            : null,
          teachingGrade:
            node.teacherProfile?.teachingGrade?.toString() ??
            (node.gradeId
              ? orgNames.gradeNames.get(node.gradeId) ?? node.gradeId
              : null),
          teachingClass:
            node.teacherProfile?.teachingClass ??
            (node.classId
              ? orgNames.classNames.get(node.classId) ?? node.classId
              : null),
          subject: node.teacherProfile?.subject ?? null,
        },
      });
      return;
    }

    nodeMap.set(node.id, {
      id: node.id,
      type: "KNOWLEDGE",
      name: node.displayName,
      group: 2,
      val: 15,
      knowledgeProfile: {
        content: node.knowledgeProfile?.content ?? null,
        type: node.knowledgeProfile?.knowledgeType ?? null,
        category: node.knowledgeProfile?.category ?? null,
      },
    });
  }
}
