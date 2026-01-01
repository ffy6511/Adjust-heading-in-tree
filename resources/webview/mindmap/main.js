(function () {
    const vscode = acquireVsCodeApi();

    let root;
    let dataRoot;
    let currentTransform = d3.zoomIdentity;
    let collapsedNodes = new Set();
    const CIRCLE_RADIUS = 6;

    window.addEventListener("message", (event) => {
        const message = event.data;
        switch (message.type) {
            case "update":
                updateMindmap(message.headings, message.expandedNodes, message.docTitle);
                break;
        }
    });

    function updateMindmap(headings, expandedNodes, docTitle) {
        if (!headings || headings.length === 0) {
            d3.select("#mindmap").selectAll("*").remove();
            return;
        }

        const virtualRoot = {
            id: "__root__",
            label: docTitle || "Mind Map",
            level: 0,
            children: headings,
        };
        dataRoot = virtualRoot;

        const allNodeIds = new Set();
        const nodeById = new Map();
        (function collect(node) {
            allNodeIds.add(node.id);
            nodeById.set(node.id, node);
            (node.children || []).forEach(collect);
        })(virtualRoot);

        const expandedNodeSet = new Set(expandedNodes);
        collapsedNodes = new Set(
            [...allNodeIds].filter(id => {
                if (id === "__root__") return false;
                const node = nodeById.get(id);
                const hasChildren = node?.children && node.children.length > 0;
                return hasChildren && !expandedNodeSet.has(id);
            })
        );

        const width = window.innerWidth;
        const height = window.innerHeight;

        const labelLineHeight = 14;
        const labelPaddingY = 6;
        const labelPaddingX = 8;
        const lineLimit = 18;
        const labelLines = (d) => {
            const text = d.data.label || "";
            const chunks = [];
            let remaining = text;
            while (remaining.length > lineLimit && chunks.length < 2) {
                chunks.push(remaining.slice(0, lineLimit));
                remaining = remaining.slice(lineLimit);
            }
            if (chunks.length < 2 && remaining.length > 0) {
                chunks.push(remaining);
            }
            if (chunks.length > 2) {
                chunks[1] = chunks[1].slice(0, lineLimit - 1) + "…";
                chunks.length = 2;
            }
            return chunks.length === 0 ? [""] : chunks;
        };
        const labelWidth = d => {
            const lines = labelLines(d);
            const longest = lines.reduce((m, l) => Math.max(m, l.length), 0);
            const textWidth = Math.min(longest * 7, lineLimit * 7);
            return textWidth + labelPaddingX * 2;
        };
        const labelHeight = d => labelLines(d).length * labelLineHeight + labelPaddingY * 2;
        const tagHeight = 12;
        const paddingBetweenLabels = 6;

        const measureBounds = (node) => {
            const hasTags = node.data.tags && node.data.tags.length > 0;
            const lblHeight = labelHeight(node);
            const baseTop = node.x - (CIRCLE_RADIUS + 6 + lblHeight);
            const baseBottom = node.x + CIRCLE_RADIUS + 10 + (hasTags ? tagHeight : 0);
            return { top: baseTop, bottom: baseBottom };
        };

        const rebuildLayout = () => {
            const cloneForLayout = (node) => {
                const kids = node.children || [];
                const clonedChildren = kids.map(cloneForLayout);
                return {
                    ...node,
                    _children: clonedChildren,
                    children: collapsedNodes.has(node.id) ? [] : clonedChildren,
                };
            };
            const layoutRoot = cloneForLayout(dataRoot);
            root = d3.hierarchy(layoutRoot);

            const tree = d3.tree()
                .nodeSize([64, 160])
                .separation(() => 1)
                .size([height, width - 200]);
            tree(root);

            // 按层基于标签/内容包围盒防重叠
            const layers = d3.group(root.descendants(), d => d.depth);
            layers.forEach((nodes) => {
                nodes.sort((a, b) => a.x - b.x);
                let lastBottom = -Infinity;
                nodes.forEach((node) => {
                    let bounds = measureBounds(node);
                    if (bounds.top < lastBottom + paddingBetweenLabels) {
                        const shift = (lastBottom + paddingBetweenLabels) - bounds.top;
                        node.x += shift;
                        bounds = measureBounds(node);
                    }
                    lastBottom = bounds.bottom;
                });
            });
        };

        rebuildLayout();

        const searchBar = document.getElementById("search-bar");
        if (searchBar) {
            searchBar.oninput = () => {
                render();
            };
        }

        const resetButton = document.getElementById("reset-view");
        if (resetButton) {
            resetButton.onclick = () => {
                d3.select("#mindmap").call(zoom.transform, d3.zoomIdentity);
            };
        }

        const fitButton = document.getElementById("fit-to-window");
        if (fitButton) {
            fitButton.onclick = () => {
                const bounds = d3.select("#mindmap g").node().getBBox();
                const fullWidth = window.innerWidth;
                const fullHeight = window.innerHeight;
                const width = bounds.width;
                const height = bounds.height;
                const midX = bounds.x + width / 2;
                const midY = bounds.y + height / 2;
                if (width === 0 || height === 0) return;
                const scale = 0.9 / Math.max(width / fullWidth, height / fullHeight);
                const translate = [fullWidth / 2 - scale * midX, fullHeight / 2 - scale * midY];

                const t = d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale);
                d3.select("#mindmap").transition().duration(750).call(zoom.transform, t);
            };
        }

        const backButton = document.getElementById("back-to-toc");
        if (backButton) {
            backButton.onclick = () => {
                vscode.postMessage({
                    type: 'toggleMindmapView'
                });
            };
        }

        const exportPngButton = document.getElementById("export-png");
        if (exportPngButton) {
            exportPngButton.onclick = () => {
                const svg = d3.select("#mindmap").node();
                const svgString = new XMLSerializer().serializeToString(svg);
                const canvas = document.createElement("canvas");
                const ctx = canvas.getContext("2d");
                const v = canvg.Canvg.fromString(ctx, svgString);
                v.start();
                const dataUrl = canvas.toDataURL("image/png");
                const a = document.createElement("a");
                a.href = dataUrl;
                a.download = "mindmap.png";
                a.click();
            };
        }

        const exportSvgButton = document.getElementById("export-svg");
        if (exportSvgButton) {
            exportSvgButton.onclick = () => {
                const svg = d3.select("#mindmap").node();
                const svgString = new XMLSerializer().serializeToString(svg);
                const blob = new Blob([svgString], { type: "image/svg+xml" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "mindmap.svg";
                a.click();
                URL.revokeObjectURL(url);
            };
        }

        const render = () => {
            d3.select("#mindmap").selectAll("*").remove();

            const filterText = (searchBar?.value ?? "").toLowerCase();
            const filteredNodes = root.descendants().filter(d => {
                if (d.depth === 0) return true; // always keep virtual root
                if (filterText === "") return true;
                return d.data.tags && d.data.tags.some(t => t.toLowerCase().includes(filterText));
            });

            let visibleNodes = filteredNodes.filter(
                d => !d.ancestors().slice(1).some(a => collapsedNodes.has(a.data.id))
            );
            const visibleLinks = root.links().filter(l => visibleNodes.includes(l.source) && visibleNodes.includes(l.target));

            const svg = d3.select("#mindmap")
                .attr("width", width)
                .attr("height", height);

            const canvas = svg.append("g")
                .attr("class", "canvas")
                .attr("transform", currentTransform.translate(100, 0));

            const palette = [
                "#4dd0e1",
                "#ff9800",
                "#ba68c8",
                "#8bc34a",
                "#ef5350",
                "#cddc39",
                "#7986cb",
                "#26c6da"
            ];
            const colorFor = d => {
                if (d.depth === 0) return "#ff9800";
                const idx = (d.data.level ?? d.depth) % palette.length;
                return palette[idx];
            };
            const nodeFill = d => {
                if (d.depth === 0) return "#1f2937";
                return collapsedNodes.has(d.data.id) ? "#374151" : colorFor(d);
            };

            canvas.selectAll(".link")
                .data(visibleLinks)
                .enter().append("path")
                .attr("class", "link")
                .attr("stroke", d => colorFor(d.target))
                .attr("d", d3.linkHorizontal().x(d => d.y).y(d => d.x));

            const node = canvas.selectAll(".node")
                .data(visibleNodes)
                .enter().append("g")
                .attr("class", d => d.data.tags && d.data.tags.length > 0 ? "node has-tags" : "node")
                .attr("transform", d => `translate(${d.y},${d.x})`)
                .attr("data-id", d => d.data.id)
                .on("click", function(event, d) {
                    const hasChildren = (d.data._children && d.data._children.length > 0);
                    if (hasChildren) {
                        if (collapsedNodes.has(d.data.id)) {
                            collapsedNodes.delete(d.data.id);
                            d3.select(this).select("text").selectAll("tspan").remove();
                            vscode.postMessage({
                                type: 'setExpandedState',
                                nodeId: d.data.id,
                                expanded: true
                            });
                        } else {
                            collapsedNodes.add(d.data.id);
                            vscode.postMessage({
                                type: 'setExpandedState',
                                nodeId: d.data.id,
                                expanded: false
                            });
                        }
                        rebuildLayout();
                        render();
                    } else {
                        vscode.postMessage({
                            type: 'revealHeading',
                            range: d.data.range
                        });
                    }
                })
                .on("dblclick", function () {
                    // intentionally no-op to avoid interfering with zoom
                });

            const circleRadius = CIRCLE_RADIUS;
            node.append("circle")
                .attr("r", circleRadius)
                .attr("fill", d => nodeFill(d));

            node.filter(d => d.data._children && d.data._children.length > 0 && collapsedNodes.has(d.data.id))
                .append("text")
                .attr("class", "node-plus")
                .attr("x", circleRadius + 6)
                .attr("dy", 4)
                .attr("text-anchor", "middle")
                .text("+")
                .attr("fill", d => nodeFill(d));

            const labelGroups = node.append("g")
                .attr("class", "label")
                .on("click", function (event, d) {
                    event.stopPropagation();
                    vscode.postMessage({
                        type: 'revealHeading',
                        range: d.data.range
                    });
                })
                .on("mouseenter", function () {
                    d3.select(this).select("rect.label-bg").style("opacity", 0.2);
                })
                .on("mouseleave", function () {
                    d3.select(this).select("rect.label-bg").style("opacity", 0);
                });

            labelGroups.append("rect")
                .attr("class", "label-bg")
                .attr("x", d => -(labelWidth(d) / 2))
                .attr("y", d => -circleRadius - 6 - labelHeight(d))
                .attr("rx", 6)
                .attr("ry", 6)
                .attr("width", d => labelWidth(d))
                .attr("height", d => labelHeight(d))
                .style("opacity", 0);

            labelGroups.append("text")
                .attr("text-anchor", "middle")
                .each(function (d) {
                    const lines = labelLines(d);
                    const totalHeight = lines.length * labelLineHeight;
                    const startY = -circleRadius - 6 - labelHeight(d) + labelPaddingY + labelLineHeight;
                    const text = d3.select(this).attr("y", startY);
                    lines.forEach((line, idx) => {
                        text.append("tspan")
                            .attr("x", 0)
                            .attr("dy", idx === 0 ? 0 : labelLineHeight)
                            .text(line);
                    });
                });

            node.filter(d => d.data.tags && d.data.tags.length > 0)
                .append("text")
                .attr("dy", circleRadius + 10)
                .attr("text-anchor", "middle")
                .style("font-size", "10px")
                .style("fill", "#a0aec0")
                .text(d => d.data.tags.join(', '));
        };

        const zoom = d3.zoom().on("zoom", (event) => {
            currentTransform = event.transform;
            d3.select("#mindmap .canvas").attr("transform", event.transform.translate(100, 0));
        });

        d3.select("#mindmap").call(zoom).call(zoom.transform, currentTransform);

        render();
    }
})();
